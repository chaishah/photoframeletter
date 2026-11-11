"""Sanitize native project settings, preserving no personal/project metadata."""
from pathlib import Path
import zipfile,json,sys
ROOT=Path(__file__).resolve().parents[1]
if len(sys.argv)!=2: raise SystemExit('Usage: python scripts/prepare_bambu.py <native-P1S-PLA-template.3mf>')
source=Path(sys.argv[1])
with zipfile.ZipFile(source) as z: settings=json.loads(z.read('Metadata/project_settings.config'))
for key in list(settings):
    if any(term in key.lower() for term in ['access_code','serial','user_id','project_id','cloud','url','path']): settings.pop(key)
settings.update(layer_height='0.2',initial_layer_print_height='0.2',wall_loops='3',top_shell_layers='5',bottom_shell_layers='5',sparse_infill_density='15%',sparse_infill_pattern='gyroid',enable_support='0',brim_type='no_brim',wall_generator='arachne',enable_prime_tower='1',prime_tower_width='35',prime_tower_brim_width='3',curr_bed_type='Textured PEI Plate',printer_model='Bambu Lab P1S',printer_settings_id='Bambu Lab P1S 0.4 nozzle',print_settings_id='Our Night Sky 0.20mm P1S',filament_colour=['#101E30','#FFFFFF','#9AC9E0','#F4E5C3'])
filament_keys=set()
existing=ROOT/'public'/'data'/'bambu-settings.json'
if existing.exists(): filament_keys.update(json.loads(existing.read_text()).get('_filament_array_keys',[]))
for p in Path(r'C:\Program Files\Bambu Studio\resources\profiles\BBL\filament').glob('*.json'):
    filament_keys.update(json.loads(p.read_text(encoding='utf-8')).keys())
array_keys=[]
for k,v in list(settings.items()):
    if (k.startswith('filament_') or k in filament_keys) and isinstance(v,list) and len(v)==1:
        settings[k]=v*4;array_keys.append(k)
settings['_filament_array_keys']=array_keys+['filament_colour','filament_settings_id','filament_type','filament_ids']
settings['different_settings_to_system']=['']*6
settings['inherits_group']=['']*6
settings['filament_settings_id']=['Bambu PLA Basic @BBL P1S 0.4 nozzle']*4
settings['filament_type']=['PLA']*4
settings['filament_ids']=['GFA00']*4
settings['flush_volumes_matrix']=['0' if i==j else '280' for i in range(4) for j in range(4)]
settings['flush_volumes_vector']=['140']*8
settings['wipe_tower_x']=['185'];settings['wipe_tower_y']=['185']
out=ROOT/'public'/'data'/'bambu-settings.json';out.write_text(json.dumps(settings,separators=(',',':')),encoding='utf-8')
print('Sanitized native Bambu settings:',out.stat().st_size,'bytes')
