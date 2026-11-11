"""Independent Skyfield/JPL fixtures. No runtime dependency on Python or an ephemeris."""
from pathlib import Path
import json,hashlib,requests
from skyfield.api import Loader,Star,wgs84,load_file
ROOT=Path(__file__).resolve().parents[1]; CACHE=ROOT/'validation'/'reference';CACHE.mkdir(parents=True,exist_ok=True)
kernel=CACHE/'de440s.bsp'
if not kernel.exists():
    r=requests.get('https://ssd.jpl.nasa.gov/ftp/eph/planets/bsp/de440s.bsp',timeout=180);r.raise_for_status();kernel.write_bytes(r.content)
loader=Loader(str(CACHE));ts=loader.timescale();eph=load_file(str(kernel));stars=json.loads((ROOT/'public/data/stars.json').read_text())
chosen=[s for s in stars if s['name'] in ['Sirius','Canopus','Arcturus','Vega','Polaris','Rigil Kentaurus','Procyon','Achernar']]
cases=[(-31.9523,115.8613,'2026-11-11T12:00:00Z'),(51.5074,-0.1278,'2026-11-11T20:00:00Z'),(0,0,'2000-01-01T12:00:00Z'),(90,0,'1950-06-21T00:00:00Z'),(-90,180,'2100-12-31T12:00:00Z'),(40.7128,-74.006,'1900-01-01T12:00:00Z')]
from datetime import datetime
out=[]
for lat,lon,utc in cases:
    dt=datetime.fromisoformat(utc.replace('Z','+00:00'))
    # Match Astronomy Engine's documented UTC ~= UT1 convention. Proleptic
    # atomic UTC differs by tens of seconds in 1900 and extrapolated 2100.
    t=ts.ut1(dt.year,dt.month,dt.day,dt.hour,dt.minute,dt.second);observer=eph['earth']+wgs84.latlon(lat,lon)
    for s in chosen:
        star=Star(ra_hours=s['ra'],dec_degrees=s['dec'],ra_mas_per_year=s['pmra'],dec_mas_per_year=s['pmdec'])
        alt,az,_=observer.at(t).observe(star).apparent().altaz()
        out.append({'latitude':lat,'longitude':lon,'utc':utc,'starId':s['id'],'name':s['name'],'altitude':alt.degrees,'azimuth':az.degrees})
folder=ROOT/'tests'/'fixtures';folder.mkdir(exist_ok=True)
(folder/'skyfield.json').write_text(json.dumps({'source':'Skyfield apparent altaz, no atmospheric refraction; JPL DE440s; civil UTC approximated as UT1 to match Astronomy Engine; historical/future atomic UTC is not implied','kernelSha256':hashlib.sha256(kernel.read_bytes()).hexdigest(),'cases':out},indent=2))
print('Independent reference cases:',len(out))
