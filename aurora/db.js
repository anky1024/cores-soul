// Aurora catalog: SQLite schema + seed data + inverted index for search.
// Reconstructed from REA evidence of Spotify web search (see /workspace/evidence).
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'catalog.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS artists (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, genres TEXT DEFAULT '', listeners INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS albums (
  id TEXT PRIMARY KEY, artist_id TEXT REFERENCES artists(id), name TEXT NOT NULL, year INTEGER, kind TEXT DEFAULT 'album'
);
CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY, album_id TEXT REFERENCES albums(id), name TEXT NOT NULL, duration_ms INTEGER, popularity INTEGER DEFAULT 0, explicit INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', owner TEXT DEFAULT 'aurora'
);
CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id TEXT REFERENCES playlists(id), track_id TEXT REFERENCES tracks(id)
);
CREATE TABLE IF NOT EXISTS events (
  ts INTEGER, type TEXT, payload TEXT
);
`);

function seed() {
  const count = db.prepare('SELECT COUNT(*) c FROM artists').get().c;
  if (count > 0) return;

  const A = [
    ['ar1','Daft Punk','electronic, house, disco',9200000],
    ['ar2','The Weeknd','pop, r&b, synthwave',125000000],
    ['ar3','Arctic Monkeys','rock, indie rock',48000000],
    ['ar4','Billie Eilish','pop, alt pop, electropop',96000000],
    ['ar5','Kendrick Lamar','hip hop, rap',74000000],
    ['ar6','Radiohead','rock, alternative, art rock',32000000],
    ['ar7','Dua Lipa','pop, dance pop, disco',68000000],
    ['ar8','Tyler, The Creator','hip hop, alternative r&b',31000000],
    ['ar9','Tame Impala','psychedelia, indie rock, electronic',24000000],
    ['ar10','Frank Ocean','r&b, alternative r&b',29000000],
    ['ar11','Pink Floyd','progressive rock, classic rock',26000000],
    ['ar12','Calvin Harris','edm, dance, house',41000000],
    ['ar13','Lana Del Rey','pop, indie pop, baroque pop',44000000],
    ['ar14','Queen','rock, classic rock, glam',38000000],
    ['ar15','Justice','electronic, french house, edm',9500000],
    ['ar16','Moderat','electronic, techno, indietronica',4200000],
    ['ar17','Boards of Canada','electronic, ambient, idm',3100000],
    ['ar18','Jet','rock, garage rock, blues rock',2400000],
    ['ar19','MGMT','psychedelic pop, electronic, indie',11000000],
    ['ar20','ODESSA','electronic, dance',900000],
  ];
  const AL = [
    ['al1','ar1','Discovery',2001,'album'],['al2','ar1','Random Access Memories',2013,'album'],
    ['al3','ar1','Homework',1997,'album'],['al4','ar2','After Hours',2020,'album'],
    ['al5','ar2','Star Boy',2016,'album'],['al6','ar3','AM',2013,'album'],
    ['al7','ar3','Whatever People Say I Am, Thats What Im Not',2006,'album'],
    ['al8','ar4','When We All Fall Asleep, Where Do We Go?',2019,'album'],
    ['al9','ar5','good kid, m.A.A.d city',2012,'album'],['al10','ar6','OK Computer',1997,'album'],
    ['al11','ar7','Future Nostalgia',2020,'album'],['al12','ar8','IGOR',2019,'album'],
    ['al13','ar9','Currents',2016,'album'],['al14','ar10','Blonde',2016,'album'],
    ['al15','ar11','The Dark Side of the Moon',1973,'album'],
    ['al16','ar12','Funk Wav Bounces Vol. 1',2017,'album'],
    ['al17','ar13','Norman Fucking Rockwell!',2019,'album'],
    ['al18','ar14','A Night at the Opera',1975,'album'],
    ['al19','ar15','Cross',2007,'album'],['al20','ar16','II',2009,'album'],
    ['al21','ar17','Music Has the Right to Children',1998,'album'],
    ['al22','ar18','Get Born',2003,'album'],['al23','ar19','Oracular Spectacular',2007,'album'],
    ['al24','ar20','Hoodoo Voodoo',2018,'album'],
    ['al25','ar1','Get Lucky (Remixes)',2013,'single'],['al26','ar2','Blinding Lights (Singles)',2020,'single'],
  ];
  const T = [
    ['t1','al1','One More Time',320000,89,0],['t2','al1','Digital Love',304000,78,0],
    ['t3','al1','Harder Better Faster Stronger',223000,85,0],
    ['t4','al2','Get Lucky',369000,92,0],['t5','al2','Instant Crush',337000,80,0],
    ['t6','al2','Lose Yourself to Dance',353000,72,0],
    ['t7','al3','Around the World',429000,81,0],['t8','al3','Da Funk',332000,68,0],
    ['t9','al4','Blinding Lights',200000,100,0],['t10','al4','Save Your Tears',215000,93,0],
    ['t11','al4','After Hours',361000,79,0],['t12','al5','Starboy',306000,91,1],
    ['t13','al5','I Feel It Coming',269000,82,0],
    ['t14','al6','Do I Wanna Know?',272000,94,0],['t15','al6','R U Mine?',201000,78,0],
    ['t16','al6','505',261000,88,0],['t17','al7','I Bet You Look Good on the Dancefloor',133000,71,0],
    ['t18','al8','bad guy',194000,96,0],['t19','al8','when the party is over',258000,80,1],
    ['t20','al9','Money Trees',386000,87,1],['t21','al9','Swimming Pools (Drank)',249000,83,1],
    ['t22','al10','Paranoid Android',373000,76,0],['t23','al10','Karma Police',263000,81,0],
    ['t24','al11','Levitating',203000,95,0],['t25','al11','Don t Start Now',243000,89,0],
    ['t26','al12','EARFQUAKE',198000,84,1],['t27','al13','The Less I Know the Better',216000,92,0],
    ['t28','al13','Let It Happen',463000,77,0],['t29','al14','Nights',307000,83,1],
    ['t30','al15','Time',413000,84,0],['t31','al15','Money',381000,86,0],
    ['t32','al16','Feel So Close',204000,75,0],['t33','al17','Venice Bitch',579000,70,1],
    ['t34','al18','Bohemian Rhapsody',354000,94,0],['t35','al18','Love of My Life',211000,80,0],
    ['t36','al19','D.A.N.C.E.',245000,72,0],['t37','al19','Genesis',408000,65,0],
    ['t38','al20','A New Error',440000,69,0],['t39','al21','Roygbiv',152000,60,0],
    ['t40','al22','Are You Gonna Be My Girl',213000,82,0],['t41','al23','Kids',302000,85,0],
    ['t42','al23','Time to Pretend',263000,79,0],['t43','al24','Descent',288000,55,0],
    ['t44','al25','Get Lucky (Pharrell Williams Remix)',372000,66,0],
    ['t45','al26','Blinding Lights (Instrumental)',200000,58,0],
    ['t46','al1','Face to Face',237000,61,0],['t47','al2','Something About Us',231000,74,0],
    ['t48','al4','Snowchild',407000,71,0],
  ];
  const P = [
    ['pl1','Today s Top Hits','The hottest tracks right now.','spotify'],
    ['pl2','Viva Latino','Baila con los mejores éxitos latinos.','spotify'],
    ['pl3','RapCaviar','News you can use in hip hop.','spotify'],
    ['pl4','All Out 2010s','The biggest songs of the 2010s.','spotify'],
    ['pl5','Rock Classics','Rock legends & epic songs.','spotify'],
    ['pl6','Chill Mix','Your relaxed mixtape.','aurora'],
    ['pl7','Electronic Rising','New and emerging electronic sounds.','aurora'],
    ['pl8','Discover Weekly','Your weekly mixtape of fresh music.','aurora'],
    ['pl9','Daft Punk Deep Cuts','Beyond the hits.','aurora'],
    ['pl10','Workout Beats','High energy to keep you moving.','aurora'],
  ];
  const PT = [
    ['pl1','t9'],['pl1','t18'],['pl1','t24'],['pl1','t10'],['pl1','t25'],['pl1','t14'],['pl1','t4'],
    ['pl2','t24'],['pl2','t25'],['pl3','t20'],['pl3','t21'],['pl3','t26'],['pl3','t12'],
    ['pl4','t9'],['pl4','t4'],['pl4','t1'],['pl4','t14'],['pl4','t27'],['pl4','t18'],['pl4','t34'],
    ['pl5','t34'],['pl5','t30'],['pl5','t31'],['pl5','t22'],['pl5','t23'],['pl5','t17'],['pl5','t40'],
    ['pl6','t27'],['pl6','t28'],['pl6','t29'],['pl6','t13'],['pl6','t39'],['pl6','t35'],
    ['pl7','t1'],['pl7','t36'],['pl7','t37'],['pl7','t38'],['pl7','t43'],['pl7','t2'],['pl7','t3'],
    ['pl8','t46'],['pl8','t47'],['pl8','t48'],['pl8','t32'],['pl8','t41'],['pl8','t42'],
    ['pl9','t2'],['pl9','t5'],['pl9','t6'],['pl9','t8'],['pl9','t46'],['pl9','t47'],['pl9','t44'],
    ['pl10','t9'],['pl10','t24'],['pl10','t32'],['pl10','t40'],['pl10','t17'],['pl10','t15'],
  ];

  const ia = db.prepare('INSERT INTO artists VALUES (?,?,?,?)');
  const ial = db.prepare('INSERT INTO albums VALUES (?,?,?,?,?)');
  const it = db.prepare('INSERT INTO tracks VALUES (?,?,?,?,?,?)');
  const ip = db.prepare('INSERT INTO playlists VALUES (?,?,?,?)');
  const ipt = db.prepare('INSERT INTO playlist_tracks VALUES (?,?)');
  db.transaction(() => {
    A.forEach(r => ia.run(...r));
    AL.forEach(r => ial.run(...r));
    T.forEach(r => it.run(...r));
    P.forEach(r => ip.run(...r));
    PT.forEach(r => ipt.run(...r));
  })();
}
seed();

module.exports = db;
