"""Transit Visualization."""
import collections
import numpy
import json
import argparse
import pprint

# PyGTFS is required.
import pygtfs as pygtfs

# Maybe just create manually.
from cityism.geojson import *

def chunks(l, n):
  for i in range(1, len(l), n): 
    yield l[i-1:i+n]
  
def route_from_stops(stops, planner):
  import cityism.planner
  # Flip from lon/lat -> lat/lon
  route = []
  otp = cityism.planner.getplanner(planner)
  flip = map(lambda x:(x[1],x[0]), stops)
  for i in range(len(flip)-1):
    start = flip[i]
    end = flip[i+1]
    a, _ = otp.plan(start=start, end=end)
    route.extend(a)  
  return route

##### Routes #####
  
def route_as_geo(route, trips, info=None, sched=None, planner=None):
  info = info or {}

  # Create the GeoJSON feature.
  f = Feature(**info)
  
  # Check if we have shapes.txt...
  trip = trips[0]
  if trip.shape_id:
    # Ok, hacky patch to pygtfs to pull it out of the sqlite-sqlalchemy db.
    q = sched.session.query(pygtfs.gtfs_entities.ShapePoint).filter_by(shape_id=trip.shape_id)
    for stop in q.all():
      f.addpoint(stop.shape_pt_lon, stop.shape_pt_lat)
  else:
    # Otherwise, reconstruct the route based on stop locations.
    stops = [(stop.stop.stop_lon, stop.stop.stop_lat) for stop in trip.stop_times]
    if planner:
      # Try to use a trip planner
      stops = route_from_stops(stops, planner=planner)
    for lon,lat in stops:
      # Otherwise, just a simple line
      f.addpoint(lon,lat)
  return f

def stop_as_geo(stop):
    f = Feature(name=str(stop), typegeom='Point')
    f.setcoords((stop.stop_lon, stop.stop_lat))
    return f
    
##### Main #####

def stopinfo(stop, sched=None):
  s = Stop(stop_id=stop.stop_id, stop=stop)
  f = s.as_geo()
  yield f
  
def routeinfo2(route, sched=None, planner=False):
  print "\n===== Route %s: %s ====="%(route.route_short_name, route.route_long_name)
  
  # Filter by Monday service for now...
  trips = filter(lambda x:getattr(x.service, 'monday', None), route.trips)
  
  # Group by by direction_id, then analyze stops...
  trips = filter(lambda x:getattr(x, 'direction_id', 0)==1, trips)
  common = collections.defaultdict(list)
  for trip in trips:
    trip.stop_times = sorted(trip.stop_times, key=lambda x:x.stop_sequence)
    stopseq = tuple(stop.stop_id for stop in trip.stop_times)
    common[stopseq].append(trip)
    # for stop in trip.stop_times:
    #   common[stop.stop_id].append(trip)

  print "Trips?", len(trips)
  for k,v in sorted(common.items(), key=lambda x:len(x[1])):
    print k
    print "\t", len(v), set([i.shape_id for i in v])
  


  return []
  
def routeinfo(route, sched=None, planner=False):
  print "\n===== Route %s: %s ====="%(route.route_short_name, route.route_long_name)
  
  # Filter by Monday service for now...
  trips = filter(lambda x:getattr(x.service, 'monday', None), route.trips)
  
  # Find each route by the sequence of stops...
  unfurled = {}
  for trip in trips:
    trip.stop_times = sorted(trip.stop_times, key=lambda x:x.stop_sequence)
    # s = tuple(i.stop_id for i in trip.stop_times)
    # s = trip.direction_id
    s = (trip.shape_id, trip.direction_id)
    if s not in unfurled:
      unfurled[s] = []
    unfurled[s].append(trip)

  for key,trips in unfurled.items():
    trips = sorted(trips, key=lambda trip:(trip.stop_times[0].arrival_time.seconds))
    # print "----- Route Group -----"
    # print key
    test_shape_id = set([trip.shape_id for trip in trips])
    test_headsign = set([trip.trip_headsign for trip in trips])
    test_times = [str(trip.stop_times[0].arrival_time) for trip in trips]

    # Make sure all headsigns and shapes match
    try:
      assert len(test_shape_id) == 1
    except AssertionError:
      print "Warning: More than one shape_id!"
    try:
      assert len(test_headsign) == 1
    except AssertionError:
      print "Warning: More than one headsign!"
      
    # Include the trip schedule.
    # Since stop sequence is identical, just store times
    # Trip start times
    r = {}
    r['route_type'] = route.route_type
    r['agency_id'] = route.agency_id
    r['route_desc'] = route.route_desc
    r['route_long_name'] = route.route_long_name
    r['route_short_name'] = route.route_short_name
    r['route_shape_id'] = trips[0].shape_id
    r['route_stops']    = [stop.stop_id for stop in trips[0].stop_times]
    r['route_schedule'] = [[getattr(stop.arrival_time, 'seconds', None) for stop in trip.stop_times] for trip in trips]
    r['trip_headsign'] = trips[0].trip_headsign
    r['direction_id'] = trips[0].direction_id
    r['trip_starts'] = [trip.stop_times[0].arrival_time.seconds for trip in trips]
    # print r
    yield route_as_geo(route=route, trips=trips, info=r, sched=sched, planner=planner)

    
if __name__ == "__main__":
  parser = argparse.ArgumentParser()
  parser.add_argument("filename", help="GTFS .zip file, or cached sqlite DB.")
  parser.add_argument("--output", help="GeoJSON output file.")
  parser.add_argument("--route", help="Run for route; helpful for debugging.", action="append")
  parser.add_argument("--stops", help="Include stops.", action="store_true")
  parser.add_argument("--exclude", help="Exclude routes", action="append")
  parser.add_argument("--planner", help="Reconstruct routes using a trip planner: osrm or otp")
  args = parser.parse_args()
  filename = args.filename
  output = args.output
  
  # Open the GTFS .zip or cache-y sqlite version.
  if filename.endswith(".db"):
    sched = pygtfs.Schedule(filename)
  elif filename.endswith(".zip"):
    sched = pygtfs.Schedule(":memory:")
    pygtfs.append_feed(sched, filename)

  # Get routes
  routes = sched.routes
  if args.route:
    routes = [i for i in sched.routes if i.route_id in args.route]
  if args.exclude:
    routes = [i for i in sched.routes if i.route_id not in args.exclude]

  # Create the collection
  c = FeatureCollection()
  
  # Calculate route stats and add to collection
  print "Routes:", routes
  for route in routes:
    for f in routeinfo2(route, sched=sched, planner=args.planner):
      c.addfeature(f)

  # Get the stops
  if args.stops:
    for stop in sched.stops:
      for f in stopinfo(stop, sched=sched):
        c.addfeature(f)
  
  # Write the geojson output.
  if args.output:
    with open(output, "w") as f:
      f.write(c.dump())
    
