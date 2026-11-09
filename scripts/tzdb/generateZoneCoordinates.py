# Rebuilds src/data/tzdb/zoneCoordinates.ts from the system tzdata (public domain). Run from the repo root:
#   python3 scripts/tzdb/generateZoneCoordinates.py
import re
def deg(s, w):
    sign = -1 if s[0]=='-' else 1
    s=s[1:]
    d=int(s[:w]); m=int(s[w:w+2]); sec=int(s[w+2:w+4]) if len(s)>w+2 else 0
    return sign*(d+m/60+sec/3600)
pos={}
for f in ['/usr/share/zoneinfo/zone.tab','/usr/share/zoneinfo/zone1970.tab']:
    for line in open(f, encoding='utf-8'):
        if line.startswith('#') or not line.strip(): continue
        p=line.rstrip('\n').split('\t')
        c=p[1]; m=re.match(r'([+-]\d+)([+-]\d+)$',c)
        la,lo=m.group(1),m.group(2)
        pos.setdefault(p[2],(round(deg(la,2),1),round(deg(lo,3),1)))
links={}
for line in open('/usr/share/zoneinfo/tzdata.zi',encoding='utf-8'):
    if line.startswith('L '):
        _,target,name=line.split()
        links[name]=target
def resolve(z,n=0):
    if z in pos: return pos[z]
    if z in links and n<5: return resolve(links[z],n+1)
    return None
for name in links:
    r=resolve(name)
    if r and name not in pos and not name.startswith('Etc/'): pos[name]=r
def fmt(v):
    s=('%.1f'%v).rstrip('0').rstrip('.')
    return '0' if s in ('-0','') else s
rows=[f"  '{k}': [{fmt(v[0])}, {fmt(v[1])}]," for k,v in sorted(pos.items())]
out=open('src/data/tzdb/zoneCoordinates.ts','w')
out.write("""// Generated from the tz database's zone.tab, zone1970.tab and links (public domain, see NOTICE).
// Each zone's principal city as [latitude, longitude], rounded to a tenth of a degree.
export const ZONE_COORDINATES: Record<string, readonly [number, number]> = {
""")
out.write('\n'.join(rows)+'\n};\n')
print(len(rows))
