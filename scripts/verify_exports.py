"""Independent XML/STL/GEOS/trimesh checks on generated artifacts."""
from pathlib import Path
import json,zipfile,io,hashlib,xml.etree.ElementTree as E
import numpy as np
import trimesh
from shapely.geometry import Polygon
from shapely.ops import unary_union
ROOT=Path(__file__).resolve().parents[1]
NS={'m':'http://schemas.microsoft.com/3dmanufacturing/core/2015/02'}
def signed_area(r):return sum(a[0]*b[1]-a[1]*b[0] for a,b in zip(r,r[1:]+r[:1]))/2
def shape(paths):
    outer=[p for p in paths if signed_area(p)>0];holes=[p for p in paths if signed_area(p)<0]
    assigned=[[] for _ in outer]
    for h in holes:
        hole=Polygon(h)
        parents=[(Polygon(p).area,i) for i,p in enumerate(outer) if Polygon(p).area>hole.area and Polygon(p).intersection(hole).area>=hole.area-1e-6]
        assert parents,'Orphan hole';assigned[min(parents)[1]].append(h)
    parts=[Polygon(p,assigned[i]) for i,p in enumerate(outer)]
    from shapely.validation import explain_validity
    assert all(p.is_valid for p in parts),[explain_validity(p) for p in parts if not p.is_valid]
    return unary_union(parts)
results=[]
for name in ['perth-default','perth-8mm','london-two-colour','north-pole']:
    source=ROOT/'samples'/f'{name}.3mf';model=json.loads((ROOT/'validation'/f'{name}.model.json').read_text())
    polys=[shape(p) for p in model['regions']]
    for i,a in enumerate(polys):
        for b in polys[i+1:]:assert a.intersection(b).area<.002
    union=unary_union(polys);assert abs(union.area*model['settings']['thickness']-model['report']['volume'])<.01
    with zipfile.ZipFile(source) as z:
        root=E.fromstring(z.read('3D/Objects/object_1.model'));meshes=[]
        for o in root.findall('m:resources/m:object',NS):
            verts=[[float(v.get(c)) for c in 'xyz'] for v in o.findall('m:mesh/m:vertices/m:vertex',NS)]
            faces=[[int(f.get(c)) for c in ['v1','v2','v3']] for f in o.findall('m:mesh/m:triangles/m:triangle',NS)]
            m=trimesh.Trimesh(vertices=verts,faces=faces,process=False)
            assert m.is_watertight and m.is_winding_consistent and m.volume>0
            meshes.append(m)
    assert sum(len(m.faces) for m in meshes)==model['report']['triangles']
    assert abs(sum(m.volume for m in meshes)-model['report']['volume'])<.01
    with zipfile.ZipFile(ROOT/'samples'/f'{name}-stl.zip') as z:
        stls=[trimesh.load(io.BytesIO(z.read(p)),file_type='stl') for p in z.namelist() if p.endswith('.stl')]
        assert len(stls)==model['report']['colours']
        assert all(m.is_watertight and m.is_winding_consistent for m in stls)
        assert abs(sum(m.volume for m in stls)-model['report']['volume'])<.02
    native=json.loads((ROOT/'validation'/'native'/name/'report.json').read_text())
    assert native['sourceSha256']==hashlib.sha256(source.read_bytes()).hexdigest(),'Native check is stale'
    assert native['returnCode']==0 and native['outputExists']
    config=E.fromstring(native['sliceInfo']);plate=config.find('plate')
    meta={m.get('key'):m.get('value') for m in plate.findall('metadata')}
    assert meta['outside']=='false' and meta['support_used']=='false'
    assert len(plate.findall('filament'))==model['report']['colours']
    for st in native['meshStats']:
        stats=E.fromstring(st)
        assert all(int(v)==0 for k,v in stats.attrib.items() if k!='face_count')
    layer_lists=[dict(x.attrib) for x in plate.findall('layer_filament_lists/layer_filament_list')]
    assert layer_lists[0]['layer_ranges']==f"0 {round(model['settings'].get('inlayDepth',0.6)/0.2)-1}"
    assert layer_lists[-1]['filament_list']=='0'
    results.append({'name':name,'sha256':native['sourceSha256'],'triangles':model['report']['triangles'],'bytes3mf':source.stat().st_size,'nativeSlice':True,'independentGeometry':True,'layerFilaments':layer_lists,'physicalPrint':False})
out=ROOT/'validation'/'release-checks.json';out.write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
