package com.splitaway.app

import android.app.Activity
import android.net.Uri
import android.util.Log
import androidx.activity.result.ActivityResult
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

private const val TAG = "ReceiptScannerPlugin"

/**
 * ReceiptScannerPlugin — Capacitor-плагин для локального сканирования чеков.
 *
 * Поток:
 * 1. JS вызывает scanReceipt()
 * 2. ML Kit Document Scanner открывает камеру (автообрезка + перспектива)
 * 3. MlKitReceiptOcrEngine распознаёт текст локально (бесплатно, офлайн)
 * 4. ReceiptParser извлекает итог, позиции, магазин, дату
 * 5. call.resolve({success, parsedResult, rawText, imageUri}) → WebView
 *
 * Не использует внешние API. API-ключи в APK не встроены.
 */
@CapacitorPlugin(name = "ReceiptScanner")
class ReceiptScannerPlugin : Plugin() {

    @Volatile private var pendingCall: PluginCall? = null
    private var scanLauncher: ActivityResultLauncher<IntentSenderRequest>? = null

    private val ocrEngine by lazy { MlKitReceiptOcrEngine(context) }

    // load() вызывается до любых PluginMethod — единственное правильное место
    // для registerForActivityResult (требование Activity Result API).
    override fun load() {
        scanLauncher = activity.registerForActivityResult(
            ActivityResultContracts.StartIntentSenderForResult()
        ) { result -> handleDocumentScannerResult(result) }
        Log.d(TAG, "ReceiptScannerPlugin loaded, scanLauncher registered")
    }

    // ── Шаг 1: запустить Document Scanner ──────────────────────────

    @PluginMethod
    fun scanReceipt(call: PluginCall) {
        call.setKeepAlive(true)
        pendingCall = call
        Log.d(TAG, "scanReceipt: starting ML Kit Document Scanner")

        val options = GmsDocumentScannerOptions.Builder()
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
            .setGalleryImportAllowed(true)
            .setPageLimit(1)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
            .build()

        GmsDocumentScanning.getClient(options)
            .getStartScanIntent(activity)
            .addOnSuccessListener { intentSender ->
                try {
                    val request = IntentSenderRequest.Builder(intentSender).build()
                    val launcher = scanLauncher
                    if (launcher == null) {
                        Log.e(TAG, "scanLauncher is null — plugin not loaded yet?")
                        pendingCall = null
                        call.setKeepAlive(false)
                        call.reject("LAUNCH_FAILED", "scanLauncher not initialized")
                        return@addOnSuccessListener
                    }
                    launcher.launch(request)
                    Log.d(TAG, "scanLauncher.launch OK")
                } catch (e: Exception) {
                    Log.e(TAG, "launcher.launch failed", e)
                    pendingCall = null
                    call.setKeepAlive(false)
                    call.reject("LAUNCH_FAILED", e.message)
                }
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "getStartScanIntent failed: ${e.message}")
                pendingCall = null
                call.setKeepAlive(false)
                call.reject("SCANNER_UNAVAILABLE", e.message)
            }
    }

    // ── Шаг 2: получить результат от ActivityResultLauncher ────────

    private fun handleDocumentScannerResult(result: ActivityResult) {
        Log.d(TAG, "handleDocumentScannerResult: resultCode=${result.resultCode}")

        val call = pendingCall ?: run {
            Log.w(TAG, "pendingCall is null — ignoring result")
            return
        }
        pendingCall = null
        call.setKeepAlive(false)

        if (result.resultCode == Activity.RESULT_CANCELED) {
            call.reject("USER_CANCELLED", "Отменено пользователем")
            return
        }
        if (result.resultCode != Activity.RESULT_OK) {
            call.reject("SCAN_FAILED", "resultCode=${result.resultCode}")
            return
        }

        val pages = GmsDocumentScanningResult.fromActivityResultIntent(result.data)?.pages
        Log.d(TAG, "Document Scanner pages: ${pages?.size}")
        if (pages.isNullOrEmpty()) {
            call.reject("NO_PAGES", "Сканер не вернул страниц")
            return
        }

        val imageUri: Uri = pages[0].imageUri
        Log.d(TAG, "Got imageUri: $imageUri")

        // ── Шаг 3: локальный OCR в фоновом потоке ──
        CoroutineScope(Dispatchers.IO).launch {
            try {
                runOcrAndResolve(call, imageUri)
            } catch (e: Throwable) {
                Log.e(TAG, "OCR crashed: ${e.javaClass.simpleName}: ${e.message}", e)
                call.reject("OCR_FAILED", "${e.javaClass.simpleName}: ${e.message ?: "unknown"}")
            }
        }
    }

    // ── Шаг 3: ML Kit OCR → ReceiptParser → resolve ────────────────

    private suspend fun runOcrAndResolve(call: PluginCall, imageUri: Uri) {
        Log.d(TAG, "Running MlKitReceiptOcrEngine on $imageUri")
        val ocrResult = ocrEngine.recognize(imageUri, 0, 0)
        Log.d(TAG, "OCR done. total=${ocrResult.parsedResult.opt("total")} items=${ocrResult.parsedResult.optJSONArray("items")?.length()}")

        val ret = JSObject()
        ret.put("success",      true)
        ret.put("parsedResult", ocrResult.parsedResult.toString())
        ret.put("rawText",      ocrResult.rawText)
        ret.put("imageUri",     imageUri.toString())
        ret.put("imageWidth",   ocrResult.imageWidth)
        ret.put("imageHeight",  ocrResult.imageHeight)

        call.resolve(ret)
    }

    // ── Lifecycle ───────────────────────────────────────────────────

    override fun handleOnDestroy() {
        ocrEngine.close()
    }
}
