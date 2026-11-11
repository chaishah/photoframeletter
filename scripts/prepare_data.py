"""Fetch public source data once; record hashes and retain licences. Runtime stays offline."""
from pathlib import Path
import csv, io, json, hashlib, zipfile, requests, gzip
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'public'/'data'; DATA.mkdir(parents=True,exist_ok=True)
LIC=ROOT/'public'/'licenses'; LIC.mkdir(parents=True,exist_ok=True)
manifest={}
def fetch(url):
    r=requests.get(url,timeout=180); r.raise_for_status()
    manifest[url]={'sha256':hashlib.sha256(r.content).hexdigest(),'bytes':len(r.content)}
    return r.content
def dump(name,data):
    (DATA/name).write_text(json.dumps(data,separators=(',',':'),ensure_ascii=False),encoding='utf-8')
hyg=fetch('https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv')
stars=[]
for row in csv.DictReader(io.StringIO(hyg.decode('utf-8'))):
    if row['id']=='0' or not row['mag'] or float(row['mag'])>6.5: continue
    stars.append({'id':int(row['id']),'hip':int(row['hip']) if row['hip'] else None,'ra':float(row['ra']),'dec':float(row['dec']),'mag':float(row['mag']),'pmra':float(row['pmra'] or 0),'pmdec':float(row['pmdec'] or 0),'name':row['proper']})
dump('stars.json',stars)
lines=json.loads(fetch('https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.lines.json'))
# Associate line endpoints with nearest J2000 catalogue positions, preserving star motion.
import math
def direction(ra,dec):
    a,d=math.radians(ra),math.radians(dec); return math.cos(d)*math.cos(a),math.cos(d)*math.sin(a),math.sin(d)
vectors=[direction(s['ra']*15,s['dec']) for s in stars]
def nearest(point):
    v=direction(*point); i=max(range(len(stars)),key=lambda i:sum(a*b for a,b in zip(v,vectors[i])))
    angle=math.degrees(math.acos(min(1,max(-1,sum(a*b for a,b in zip(v,vectors[i]))))))
    if angle>0.12: raise ValueError(f'Unmatched constellation endpoint: {point}, nearest {angle} degrees')
    return stars[i]['id']
segments=[]
for f in lines['features']:
    for line in f['geometry']['coordinates']:
        ids=[nearest(p) for p in line]
        segments.extend([[a,b] for a,b in zip(ids,ids[1:]) if a!=b])
dump('constellations.json',segments)
gazetteer=zipfile.ZipFile(io.BytesIO(fetch('https://download.geonames.org/export/dump/cities1000.zip')))
cities=[]
for row in csv.reader(io.TextIOWrapper(gazetteer.open('cities1000.txt'),encoding='utf-8'),delimiter='\t'):
    cities.append([row[0],row[1],row[2],row[8],row[10],float(row[4]),float(row[5]),row[17],int(row[14])])
cities.sort(key=lambda c:-c[8]); (DATA/'cities.json.gz').write_bytes(gzip.compress(json.dumps(cities,separators=(',',':'),ensure_ascii=False).encode(),mtime=0))
countries={}
for row in fetch('https://download.geonames.org/export/dump/countryInfo.txt').decode().splitlines():
    if row and not row.startswith('#'):
        p=row.split('\t'); countries[p[0]]=p[4]
dump('countries.json',countries)
admins={}
for row in fetch('https://download.geonames.org/export/dump/admin1CodesASCII.txt').decode().splitlines():
    p=row.split('\t'); admins[p[0]]=p[1]
dump('regions.json',admins)
font=fetch('https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Bold.ttf')
(DATA/'NotoSans-Bold.ttf').write_bytes(font)
for name,url in [('HYG.txt','https://raw.githubusercontent.com/astronexus/HYG-Database/main/LICENSE'),('d3-celestial.txt','https://raw.githubusercontent.com/ofrohn/d3-celestial/master/LICENSE'),('Noto.txt','https://raw.githubusercontent.com/notofonts/noto-fonts/main/LICENSE')]:
    (LIC/name).write_bytes(fetch(url))
(LIC/'GeoNames.txt').write_text('GeoNames: https://www.geonames.org/ — CC BY 4.0 https://creativecommons.org/licenses/by/4.0/\nDerived city subset. Data supplied without warranty.\n',encoding='utf-8')
dump('sources.json',manifest)
print(json.dumps({'stars':len(stars),'segments':len(segments),'cities':len(cities),'dataBytes':sum(p.stat().st_size for p in DATA.iterdir())}))
