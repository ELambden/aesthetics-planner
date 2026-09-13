"""Build a small, attributed station snapshot from NaPTAN (no runtime API needed)."""
import argparse
import csv
import hashlib
import json
import math
import re
import shutil
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from shapely import make_valid
from shapely.geometry import Point, shape
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'generated/naptan-stops.csv'
URL = 'https://naptan.api.dft.gov.uk/v1/access-nodes?dataFormat=csv'
BOUNDS = (-0.35, 51.38, 1.38, 52.18)
# A local equidistant approximation; the UI uses a conservative 25 m boundary margin.
X_SCALE = 6371 * math.pi / 180 * math.cos(math.radians(51.78))
Y_SCALE = 6371 * math.pi / 180


def project(x, y, z=None):
    return x * X_SCALE, y * Y_SCALE


def clean_name(name):
    name = re.sub(r'\s+\(London\)', '', name, flags=re.I)
    name = re.sub(r'\s+(?:Rail|Railway|Underground|DLR)\s+Station$', '', name, flags=re.I)
    name = re.sub(r'\s+Station$', '', name, flags=re.I)
    if name.startswith('London ') and name != 'London Bridge':
        name = name.removeprefix('London ')
    return name.strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download', action='store_true', help='Refresh the national NaPTAN CSV before building')
    args = parser.parse_args()
    if args.download or not RAW.exists():
        RAW.parent.mkdir(exist_ok=True)
        pending = RAW.with_suffix('.download')
        with urllib.request.urlopen(URL, timeout=120) as response, pending.open('wb') as output:
            shutil.copyfileobj(response, output)
        with pending.open('rb') as downloaded:
            valid_header = downloaded.read(200).startswith(b'ATCOCode,')
        if not valid_header:
            raise ValueError('NaPTAN did not return its expected CSV header')
        pending.replace(RAW)

    candidates = []
    with RAW.open(encoding='utf-8-sig', newline='') as source:
        for row in csv.DictReader(source):
            if row['Status'] != 'active' or row['StopType'] not in ('RLY', 'MET'):
                continue
            try:
                lng, lat = float(row['Longitude']), float(row['Latitude'])
            except ValueError:
                continue
            if not (BOUNDS[0] <= lng <= BOUNDS[2] and BOUNDS[1] <= lat <= BOUNDS[3]):
                continue
            code, name = row['ATCOCode'], row['CommonName']
            if row['StopType'] == 'RLY':
                mode = 'Rail'
            elif 'ZZLU' in code or 'underground' in name.lower():
                mode = 'Underground'
            elif 'ZZDL' in code or 'dlr' in name.lower():
                mode = 'DLR'
            else:
                # Tram/cable-car access points are outside the requested rail/tube scope.
                continue
            candidates.append({
                'id': code, 'name': clean_name(name), 'lat': lat, 'lng': lng,
                'locality': row['LocalityName'], 'modes': [mode], 'sourceIds': [code],
                '_priority': 0 if code.startswith('9100') else 1 if code.startswith('9400') else 2
            })

    # Prefer national station access points over local entrance duplicates.
    # Consolidate same-name interchanges only within 400 m; retain distinct station names.
    stations = []
    for candidate in sorted(candidates, key=lambda item: (item['_priority'], item['id'])):
        key = re.sub(r'[^a-z0-9]', '', candidate['name'].lower().replace('&', 'and'))
        match = next((station for station in stations
                      if station['_key'] == key
                      and math.hypot((station['lng'] - candidate['lng']) * X_SCALE,
                                     (station['lat'] - candidate['lat']) * Y_SCALE) <= 0.4), None)
        if match:
            match['sourceIds'].extend(candidate['sourceIds'])
            match['modes'] = sorted(set(match['modes'] + candidate['modes']))
        else:
            stations.append({**candidate, '_key': key})

    density_bytes = (ROOT / 'public/data/density-overlay.geojson').read_bytes()
    features = json.loads(density_bytes)['features']
    polygons = [make_valid(transform(project, shape(feature['geometry']))) for feature in features]
    tree = STRtree(polygons)
    study_area = unary_union(polygons)
    for station in stations:
        point = Point(*project(station['lng'], station['lat']))
        station['inStudyArea'] = bool(study_area.covers(point))
        station['boundaryDistanceKm'] = round(point.distance(study_area.boundary), 4)
        matches = tree.query(point, predicate='intersects')
        if len(matches):
            properties = features[int(matches[0])]['properties']
            station['areaCode'] = properties['areaCode']
            station['localAuthority'] = properties['localAuthority']
        station.pop('_priority')
        station.pop('_key')
        station['sourceIds'].sort()

    assert len(stations) > 100, 'Unexpectedly few stations; review the source before publishing.'
    assert len({station['id'] for station in stations}) == len(stations)
    required = {'Chelmsford', 'Colchester', 'Romford', 'Upminster', 'Epping', 'Chingford', 'Stratford'}
    assert required <= {station['name'] for station in stations}, 'Expected stations are missing.'
    output = {
        'updatedAt': datetime.fromtimestamp(RAW.stat().st_mtime, timezone.utc).isoformat(),
        'source': 'Department for Transport NaPTAN', 'sourceUrl': URL,
        'attribution': 'Contains public sector information licensed under the Open Government Licence v3.0. © Crown copyright.',
        'licenceUrl': 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
        'studyArea': 'Essex and Havering',
        'coverageSourceSha256': hashlib.sha256(density_bytes).hexdigest(),
        'stations': sorted(stations, key=lambda station: (station['name'], station['id']))
    }
    target = ROOT / 'public/data/stations.json'
    target.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    inside = sum(station['inStudyArea'] for station in stations)
    print(f'Built {len(stations)} station markers from {len(candidates)} access records; {inside} inside the study area.')
    print(f'Wrote {target.relative_to(ROOT)} ({target.stat().st_size:,} bytes).')


if __name__ == '__main__':
    main()
