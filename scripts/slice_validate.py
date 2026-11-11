"""Native Bambu CLI validation; output is evidence for the exact SHA-256 input."""
from pathlib import Path
import subprocess,zipfile,json,hashlib,re,sys,time
ROOT=Path(__file__).resolve().parents[1]
EXE=Path(r'C:\Program Files\Bambu Studio\bambu-studio.exe')
for name in (sys.argv[1:] or ['perth-default']):
    source=ROOT/'samples'/(name+'.3mf'); folder=ROOT/'validation'/'native'/name;folder.mkdir(parents=True,exist_ok=True)
    target=folder/'sliced.3mf'; logpath=folder/'slice.log'
    cmd=[str(EXE),'--arrange','0','--slice','0','--debug','2','--export-3mf',str(target),str(source)]
    start=time.monotonic()
    with logpath.open('w',encoding='utf-8') as log:
        process=subprocess.Popen(cmd,cwd=folder,stdout=log,stderr=subprocess.STDOUT,creationflags=0x08000000)
        print(json.dumps({'sample':name,'pid':process.pid,'status':'slicing'}),flush=True)
        try:code=process.wait(timeout=600)
        except subprocess.TimeoutExpired:process.terminate();process.wait(timeout=15);code=-999
    result={'sample':name,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'returnCode':code,'elapsedSeconds':time.monotonic()-start,'outputExists':target.exists(),'physicalPrintTested':False}
    if target.exists():
        with zipfile.ZipFile(target) as z:
            result['sliceInfo']=z.read('Metadata/slice_info.config').decode()
            cfg=z.read('Metadata/model_settings.config').decode();result['meshStats']=re.findall(r'<mesh_stat[^>]*>',cfg)
            g=z.read('Metadata/plate_1.gcode').decode(errors='replace')
            result['statistics']=[l for l in g.splitlines() if re.search(r'^;.*(estimated printing time|total estimated time|filament used|total layer number|filament change)',l)]
            (folder/'gcode.txt').write_text(g,encoding='utf-8')
            (folder/'slice_info.config').write_text(result['sliceInfo'],encoding='utf-8')
    (folder/'report.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result),flush=True)
