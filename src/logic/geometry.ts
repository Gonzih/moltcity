interface Point {
  lat: number;
  lng: number;
}

// Check if two line segments intersect
export function segmentsIntersect(
  p1: Point,
  p2: Point,
  p3: Point,
  p4: Point
): boolean {
  const ccw = (a: Point, b: Point, c: Point): boolean => {
    return (c.lat - a.lat) * (b.lng - a.lng) > (b.lat - a.lat) * (c.lng - a.lng);
  };

  // Check if segments share an endpoint (not a real crossing)
  const shareEndpoint =
    (p1.lat === p3.lat && p1.lng === p3.lng) ||
    (p1.lat === p4.lat && p1.lng === p4.lng) ||
    (p2.lat === p3.lat && p2.lng === p3.lng) ||
    (p2.lat === p4.lat && p2.lng === p4.lng);

  if (shareEndpoint) return false;

  return (
    ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4)
  );
}

// Calculate triangle area in approximate km²
export function triangleArea(p1: Point, p2: Point, p3: Point): number {
  // Shoelace formula for area in coordinate units
  const area = Math.abs(
    (p1.lat * (p2.lng - p3.lng) +
      p2.lat * (p3.lng - p1.lng) +
      p3.lat * (p1.lng - p2.lng)) /
      2
  );

  // Convert to rough km² (1 degree ≈ 111km)
  return area * 111 * 111;
}

// Calculate distance between two points in km
export function distance(p1: Point, p2: Point): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(p2.lat - p1.lat);
  const dLng = toRad(p2.lng - p1.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(p1.lat)) *
      Math.cos(toRad(p2.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

// Calculate influence from field area (base score, can add population later)
export function calculateInfluence(areaKm2: number): number {
  return Math.floor(areaKm2 * 1000);
}
