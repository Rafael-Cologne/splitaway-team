const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const source=path.join(root,'public');
const destination=path.join(root,'deploy');
fs.mkdirSync(destination,{recursive:true});
for(const entry of fs.readdirSync(source)){
  fs.cpSync(path.join(source,entry),path.join(destination,entry),{recursive:true,force:true});
}
console.log('Copied public/ to deploy/');
