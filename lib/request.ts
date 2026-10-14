import { RootObject } from "./types";
import { progress } from "./progress";

/**
 * Builds a zoom-adaptive Overpass query that fetches appropriate detail
 * for the given zoom level. Lower zoom levels fetch fewer features to avoid
 * timeouts and keep geometry manageable.
 */
function buildOverpassQuery(
  bbox: [number, number, number, number],
  zoom: number
): string {
  // Overpass uses lat/lon bbox order: (south, west, north, east)
  const bboxString = [bbox[1], bbox[0], bbox[3], bbox[2]].join(",");

  if (zoom < 10) {
    // Regional: major infrastructure only
    // Only motorways, trunks, rail, and large water/parks
    return `[out:json][timeout:30];(
      way[highway~"^(motorway|motorway_link|trunk|trunk_link)$"](${bboxString});
      way[railway~"^(rail|subway|light_rail)$"](${bboxString});
      way[natural~"^(water|coastline)$"](${bboxString});
      way[landuse~"^(reservoir|basin)$"](${bboxString});
      way[leisure~"^(park|nature_reserve)$"][area>1000000](${bboxString});
      <;
      node(w);
    );out;`;
  } else if (zoom < 12) {
    // City: primary/secondary roads and medium features
    // Add primary/secondary roads, universities, medium parks/water
    return `[out:json][timeout:30];(
      way[highway~"^(motorway|trunk|primary|secondary).*$"](${bboxString});
      way[railway](${bboxString});
      way[natural~"^(water|wood)$"](${bboxString});
      way[landuse~"^(reservoir|basin|forest|industrial|commercial)$"](${bboxString});
      way[leisure~"^(park|nature_reserve|golf_course)$"](${bboxString});
      way[amenity~"^(university|college|hospital)$"](${bboxString});
      <;
      node(w);
    );out;`;
  } else if (zoom < 14) {
    // Neighborhood: all roads and large buildings
    // Shows full road network but limits buildings to large structures
    return `[out:json][timeout:30];(
      way[highway](${bboxString});
      way[railway](${bboxString});
      way[building][area>500](${bboxString});
      way[natural](${bboxString});
      way[landuse](${bboxString});
      way[leisure](${bboxString});
      way[amenity](${bboxString});
      <;
      node(w);
    );out;`;
  } else {
    // Full detail: current behavior for close-up views
    return `[out:json][timeout:30];(node(${bboxString});<;node(w););out;`;
  }
}

export async function request(
  bbox: [number, number, number, number],
  zoom: number = 15
) {
  const query = buildOverpassQuery(bbox, zoom);

  const res = await fetch(
    `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
    {
      /**
       * Figma doesn't support Headers()
       */
      headersObject: {
        Accept: "application/json",
      },
    } as unknown as RequestInit
  );

  progress("Getting text");

  if (res.status >= 400) {
    const error = (res as any).headersObject.error;
    if (error) {
      throw new Error(error);
    }
    throw new Error("Bad response from server (probably too zoomed-out)");
  }

  /**
   * Figma doesn't have req.json()
   */
  const text = await res.text();

  progress("Parsing JSON");

  return JSON.parse(text) as RootObject;
}
