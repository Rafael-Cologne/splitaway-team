-- Demo trips for the public portfolio build — one per UI language (7 total),
-- so the "Try demo" button always opens a demo whose content matches the
-- language the visitor just picked on the welcome screen.
--
-- Adds 7 new, fully isolated trips (fixed ids 'DEMO-EN'..'DEMO-IT') with
-- fictional data, plus a reset_demo_trip() RPC that restores all 7 to their
-- seed state on demand. Nothing here touches any existing trip, table
-- schema, or existing function signature.
--
-- Safety properties (same reasoning as the original single-trip design):
--   * reset_demo_trip() takes NO parameters — the 7 trip ids are a
--     hardcoded constant array inside the function body, so it is
--     structurally impossible for this function to ever touch any trip
--     other than these 7 fixed demo ones.
--   * Each demo trip gets a real, random admin_token_hash (like any normal
--     trip) — visitors never have the matching token, so admin-only writes
--     (role changes, delete) are correctly rejected for them, exactly like
--     for a real trip — this relies on the admin-token fixes already
--     shipped this session (migrations 006/010/011/012).
--   * reset_demo_trip() is granted to anon/authenticated (like every other
--     RPC in this app) since it's called from the client whenever a
--     visitor leaves a demo trip — it can only ever affect these 7 fixed
--     ids, so exposing it publicly is safe.

INSERT INTO trips (id, name, dest) VALUES
  ('DEMO-EN','Weekend in Lisbon','Lisbon'),
  ('DEMO-RU','Выходные в Лиссабоне','Лиссабон'),
  ('DEMO-DE','Wochenende in Lissabon','Lissabon'),
  ('DEMO-ES','Fin de semana en Lisboa','Lisboa'),
  ('DEMO-FR','Week-end à Lisbonne','Lisbonne'),
  ('DEMO-PT','Fim de semana em Lisboa','Lisboa'),
  ('DEMO-IT','Fine settimana a Lisbona','Lisbona')
ON CONFLICT (id) DO NOTHING;

INSERT INTO trip_tokens (trip_id, admin_token_hash)
SELECT t.id, encode(extensions.digest(encode(extensions.gen_random_bytes(16),'hex'),'sha256'),'hex')
FROM (VALUES ('DEMO-EN'),('DEMO-RU'),('DEMO-DE'),('DEMO-ES'),('DEMO-FR'),('DEMO-PT'),('DEMO-IT')) AS t(id)
ON CONFLICT (trip_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.reset_demo_trip()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_demo_ids CONSTANT text[] := ARRAY['DEMO-EN','DEMO-RU','DEMO-DE','DEMO-ES','DEMO-FR','DEMO-PT','DEMO-IT'];
BEGIN
  DELETE FROM expenses WHERE trip_id = ANY(v_demo_ids);
  DELETE FROM groups   WHERE trip_id = ANY(v_demo_ids);
  DELETE FROM members  WHERE trip_id = ANY(v_demo_ids);

  INSERT INTO members (trip_id,name,gender,is_admin) VALUES
    ('DEMO-EN','James','m',true),('DEMO-EN','Emma','f',false),('DEMO-EN','Daniel','m',false),('DEMO-EN','Olivia','f',false),
    ('DEMO-RU','Иван','m',true),('DEMO-RU','Мария','f',false),('DEMO-RU','Дмитрий','m',false),('DEMO-RU','Алина','f',false),
    ('DEMO-DE','Lukas','m',true),('DEMO-DE','Sophie','f',false),('DEMO-DE','Max','m',false),('DEMO-DE','Anna','f',false),
    ('DEMO-ES','Carlos','m',true),('DEMO-ES','Lucía','f',false),('DEMO-ES','Diego','m',false),('DEMO-ES','Elena','f',false),
    ('DEMO-FR','Julien','m',true),('DEMO-FR','Camille','f',false),('DEMO-FR','Thomas','m',false),('DEMO-FR','Léa','f',false),
    ('DEMO-PT','João','m',true),('DEMO-PT','Beatriz','f',false),('DEMO-PT','Tiago','m',false),('DEMO-PT','Marta','f',false),
    ('DEMO-IT','Marco','m',true),('DEMO-IT','Giulia','f',false),('DEMO-IT','Luca','m',false),('DEMO-IT','Chiara','f',false);

  INSERT INTO groups (trip_id,type,label,members) VALUES
    ('DEMO-EN','couple',NULL,ARRAY['Daniel','Olivia']),
    ('DEMO-RU','couple',NULL,ARRAY['Дмитрий','Алина']),
    ('DEMO-DE','couple',NULL,ARRAY['Max','Anna']),
    ('DEMO-ES','couple',NULL,ARRAY['Diego','Elena']),
    ('DEMO-FR','couple',NULL,ARRAY['Thomas','Léa']),
    ('DEMO-PT','couple',NULL,ARRAY['Tiago','Marta']),
    ('DEMO-IT','couple',NULL,ARRAY['Luca','Chiara']);

  INSERT INTO expenses (trip_id,name,amount,comment,date,paid_by,participants,from_treasury,items,splits) VALUES
    ('DEMO-EN','Apartment rental',480.00,'3 nights, booking.com',current_date-3,'James',ARRAY['James','Emma','Daniel','Olivia'],false,'[]',NULL),
    ('DEMO-EN','Dinner at the restaurant',156.40,'First evening dinner',current_date-3,'Emma',ARRAY['James','Emma','Daniel','Olivia'],false,'[]',NULL),
    ('DEMO-EN','Supermarket shopping',63.80,'Breakfast & snacks',current_date-2,'Olivia',ARRAY['James','Emma','Daniel','Olivia'],true,'[]',NULL),
    ('DEMO-EN','Museum tickets',48.00,NULL,current_date-2,'Daniel',ARRAY['Daniel','Olivia'],false,'[]',NULL),
    ('DEMO-EN','Taxi to the station',22.50,NULL,current_date-1,'James',ARRAY['James','Emma'],false,'[]',NULL),
    ('DEMO-EN','Bar - last evening',89.70,'Last evening',current_date-1,'Daniel',ARRAY['James','Emma','Daniel','Olivia'],false,'[]','{"James":25.20,"Emma":25.20,"Daniel":19.65,"Olivia":19.65}'::jsonb),

    ('DEMO-RU','Аренда квартиры',480.00,'3 ночи, booking.com',current_date-3,'Иван',ARRAY['Иван','Мария','Дмитрий','Алина'],false,'[]',NULL),
    ('DEMO-RU','Ужин в ресторане',156.40,'Ужин в первый вечер',current_date-3,'Мария',ARRAY['Иван','Мария','Дмитрий','Алина'],false,'[]',NULL),
    ('DEMO-RU','Покупки в супермаркете',63.80,'Завтраки и снеки',current_date-2,'Алина',ARRAY['Иван','Мария','Дмитрий','Алина'],true,'[]',NULL),
    ('DEMO-RU','Билеты в музей',48.00,NULL,current_date-2,'Дмитрий',ARRAY['Дмитрий','Алина'],false,'[]',NULL),
    ('DEMO-RU','Такси на вокзал',22.50,NULL,current_date-1,'Иван',ARRAY['Иван','Мария'],false,'[]',NULL),
    ('DEMO-RU','Бар — последний вечер',89.70,'Последний вечер',current_date-1,'Дмитрий',ARRAY['Иван','Мария','Дмитрий','Алина'],false,'[]','{"Иван":25.20,"Мария":25.20,"Дмитрий":19.65,"Алина":19.65}'::jsonb),

    ('DEMO-DE','Ferienwohnung',480.00,'3 Nächte, booking.com',current_date-3,'Lukas',ARRAY['Lukas','Sophie','Max','Anna'],false,'[]',NULL),
    ('DEMO-DE','Abendessen im Restaurant',156.40,'Abendessen am ersten Abend',current_date-3,'Sophie',ARRAY['Lukas','Sophie','Max','Anna'],false,'[]',NULL),
    ('DEMO-DE','Supermarkt-Einkauf',63.80,'Frühstück & Snacks',current_date-2,'Anna',ARRAY['Lukas','Sophie','Max','Anna'],true,'[]',NULL),
    ('DEMO-DE','Museumseintritt',48.00,NULL,current_date-2,'Max',ARRAY['Max','Anna'],false,'[]',NULL),
    ('DEMO-DE','Taxi zum Bahnhof',22.50,NULL,current_date-1,'Lukas',ARRAY['Lukas','Sophie'],false,'[]',NULL),
    ('DEMO-DE','Bar am letzten Abend',89.70,'Letzter Abend',current_date-1,'Max',ARRAY['Lukas','Sophie','Max','Anna'],false,'[]','{"Lukas":25.20,"Sophie":25.20,"Max":19.65,"Anna":19.65}'::jsonb),

    ('DEMO-ES','Alquiler del apartamento',480.00,'3 noches, booking.com',current_date-3,'Carlos',ARRAY['Carlos','Lucía','Diego','Elena'],false,'[]',NULL),
    ('DEMO-ES','Cena en el restaurante',156.40,'Cena de la primera noche',current_date-3,'Lucía',ARRAY['Carlos','Lucía','Diego','Elena'],false,'[]',NULL),
    ('DEMO-ES','Compra en el supermercado',63.80,'Desayunos y snacks',current_date-2,'Elena',ARRAY['Carlos','Lucía','Diego','Elena'],true,'[]',NULL),
    ('DEMO-ES','Entradas al museo',48.00,NULL,current_date-2,'Diego',ARRAY['Diego','Elena'],false,'[]',NULL),
    ('DEMO-ES','Taxi a la estación',22.50,NULL,current_date-1,'Carlos',ARRAY['Carlos','Lucía'],false,'[]',NULL),
    ('DEMO-ES','Bar — última noche',89.70,'Última noche',current_date-1,'Diego',ARRAY['Carlos','Lucía','Diego','Elena'],false,'[]','{"Carlos":25.20,"Lucía":25.20,"Diego":19.65,"Elena":19.65}'::jsonb),

    ('DEMO-FR','Location de l''appartement',480.00,'3 nuits, booking.com',current_date-3,'Julien',ARRAY['Julien','Camille','Thomas','Léa'],false,'[]',NULL),
    ('DEMO-FR','Dîner au restaurant',156.40,'Dîner du premier soir',current_date-3,'Camille',ARRAY['Julien','Camille','Thomas','Léa'],false,'[]',NULL),
    ('DEMO-FR','Courses au supermarché',63.80,'Petits-déjeuners & encas',current_date-2,'Léa',ARRAY['Julien','Camille','Thomas','Léa'],true,'[]',NULL),
    ('DEMO-FR','Billets pour le musée',48.00,NULL,current_date-2,'Thomas',ARRAY['Thomas','Léa'],false,'[]',NULL),
    ('DEMO-FR','Taxi pour la gare',22.50,NULL,current_date-1,'Julien',ARRAY['Julien','Camille'],false,'[]',NULL),
    ('DEMO-FR','Bar — dernier soir',89.70,'Dernier soir',current_date-1,'Thomas',ARRAY['Julien','Camille','Thomas','Léa'],false,'[]','{"Julien":25.20,"Camille":25.20,"Thomas":19.65,"Léa":19.65}'::jsonb),

    ('DEMO-PT','Aluguer do apartamento',480.00,'3 noites, booking.com',current_date-3,'João',ARRAY['João','Beatriz','Tiago','Marta'],false,'[]',NULL),
    ('DEMO-PT','Jantar no restaurante',156.40,'Jantar da primeira noite',current_date-3,'Beatriz',ARRAY['João','Beatriz','Tiago','Marta'],false,'[]',NULL),
    ('DEMO-PT','Compras no supermercado',63.80,'Pequenos-almoços e snacks',current_date-2,'Marta',ARRAY['João','Beatriz','Tiago','Marta'],true,'[]',NULL),
    ('DEMO-PT','Bilhetes do museu',48.00,NULL,current_date-2,'Tiago',ARRAY['Tiago','Marta'],false,'[]',NULL),
    ('DEMO-PT','Táxi para a estação',22.50,NULL,current_date-1,'João',ARRAY['João','Beatriz'],false,'[]',NULL),
    ('DEMO-PT','Bar — última noite',89.70,'Última noite',current_date-1,'Tiago',ARRAY['João','Beatriz','Tiago','Marta'],false,'[]','{"João":25.20,"Beatriz":25.20,"Tiago":19.65,"Marta":19.65}'::jsonb),

    ('DEMO-IT','Affitto appartamento',480.00,'3 notti, booking.com',current_date-3,'Marco',ARRAY['Marco','Giulia','Luca','Chiara'],false,'[]',NULL),
    ('DEMO-IT','Cena al ristorante',156.40,'Cena della prima sera',current_date-3,'Giulia',ARRAY['Marco','Giulia','Luca','Chiara'],false,'[]',NULL),
    ('DEMO-IT','Spesa al supermercato',63.80,'Colazioni e snack',current_date-2,'Chiara',ARRAY['Marco','Giulia','Luca','Chiara'],true,'[]',NULL),
    ('DEMO-IT','Biglietti museo',48.00,NULL,current_date-2,'Luca',ARRAY['Luca','Chiara'],false,'[]',NULL),
    ('DEMO-IT','Taxi per la stazione',22.50,NULL,current_date-1,'Marco',ARRAY['Marco','Giulia'],false,'[]',NULL),
    ('DEMO-IT','Bar — ultima sera',89.70,'Ultima sera',current_date-1,'Luca',ARRAY['Marco','Giulia','Luca','Chiara'],false,'[]','{"Marco":25.20,"Giulia":25.20,"Luca":19.65,"Chiara":19.65}'::jsonb);

  INSERT INTO treasury (trip_id,total,spent,contributions,holder,settled_debts) VALUES
    ('DEMO-EN',150.00,63.80,
      jsonb_build_array(jsonb_build_object('member','James','amount',75,'date',(current_date-3)::text),jsonb_build_object('member','Olivia','amount',75,'date',(current_date-3)::text)),
      'Olivia',
      jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'from','Emma','to','James','amount',30,'date',(current_date-1)::text))),
    ('DEMO-RU',150.00,63.80,
      jsonb_build_array(jsonb_build_object('member','Иван','amount',75,'date',(current_date-3)::text),jsonb_build_object('member','Алина','amount',75,'date',(current_date-3)::text)),
      'Алина',
      jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'from','Мария','to','Иван','amount',30,'date',(current_date-1)::text))),
    ('DEMO-DE',150.00,63.80,
      jsonb_build_array(jsonb_build_object('member','Lukas','amount',75,'date',(current_date-3)::text),jsonb_build_object('member','Anna','amount',75,'date',(current_date-3)::text)),
      'Anna',
      jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'from','Sophie','to','Lukas','amount',30,'date',(current_date-1)::text))),
    ('DEMO-ES',150.00,63.80,
      jsonb_build_array(jsonb_build_object('member','Carlos','amount',75,'date',(current_date-3)::text),jsonb_build_object('member','Elena','amount',75,'date',(current_date-3)::text)),
      'Elena',
      jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'from','Lucía','to','Carlos','amount',30,'date',(current_date-1)::text))),
    ('DEMO-FR',150.00,63.80,
      jsonb_build_array(jsonb_build_object('member','Julien','amount',75,'date',(current_date-3)::text),jsonb_build_object('member','Léa','amount',75,'date',(current_date-3)::text)),
      'Léa',
      jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'from','Camille','to','Julien','amount',30,'date',(current_date-1)::text))),
    ('DEMO-PT',150.00,63.80,
      jsonb_build_array(jsonb_build_object('member','João','amount',75,'date',(current_date-3)::text),jsonb_build_object('member','Marta','amount',75,'date',(current_date-3)::text)),
      'Marta',
      jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'from','Beatriz','to','João','amount',30,'date',(current_date-1)::text))),
    ('DEMO-IT',150.00,63.80,
      jsonb_build_array(jsonb_build_object('member','Marco','amount',75,'date',(current_date-3)::text),jsonb_build_object('member','Chiara','amount',75,'date',(current_date-3)::text)),
      'Chiara',
      jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'from','Giulia','to','Marco','amount',30,'date',(current_date-1)::text)))
  ON CONFLICT (trip_id) DO UPDATE SET
    total=EXCLUDED.total, spent=EXCLUDED.spent, contributions=EXCLUDED.contributions,
    holder=EXCLUDED.holder, settled_debts=EXCLUDED.settled_debts, updated_at=now();

  RETURN jsonb_build_object('ok',true,'trips',v_demo_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_demo_trip() TO anon, authenticated;

-- Seed all 7 demo trips right now so they're ready immediately after this migration.
SELECT reset_demo_trip();
