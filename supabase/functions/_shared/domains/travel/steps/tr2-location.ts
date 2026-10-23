// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step TR2: Location Corroboration and Declared Places.
// Source: Part 2 Layer 2 (Section 4.3, TR2).

import { haversineDistanceKm } from "../../location/index.ts";
import { TRAVEL_DISTANCE_KM } from "../constants.ts";

export interface LocationReadingInput {
  lat: number;
  lng: number;
  timestampUtc: string;
}

export interface HomeAnchorInput {
  lat: number;
  lng: number;
}

export interface DeclaredPlace {
  name: string;
  lat: number;
  lng: number;
  radiusKm: number;
}

export function stepLocationCorroboration(params: {
  latestReading?: LocationReadingInput | null;
  homeAnchor?: HomeAnchorInput | null;
  declaredPlaces?: DeclaredPlace[];
}): {
  distanceFromHomeKm: number | null;
  isAwayByLocation: boolean | null; // null = unknown
  isUserDeclaredPlace: boolean;
} {
  if (!params.latestReading || !params.homeAnchor) {
    return {
      distanceFromHomeKm: null,
      isAwayByLocation: null, // missing reading means unknown, never away
      isUserDeclaredPlace: false,
    };
  }

  // Check declared places first (e.g. second home 80km away)
  if (params.declaredPlaces && params.declaredPlaces.length > 0) {
    for (const place of params.declaredPlaces) {
      const distToPlace = haversineDistanceKm(
        { lat: params.latestReading.lat, lng: params.latestReading.lng },
        { lat: place.lat, lng: place.lng },
      );
      if (distToPlace <= place.radiusKm) {
        return {
          distanceFromHomeKm: distToPlace,
          isAwayByLocation: false, // user-declared place does not count as away
          isUserDeclaredPlace: true,
        };
      }
    }
  }

  const distFromHome = haversineDistanceKm(
    { lat: params.latestReading.lat, lng: params.latestReading.lng },
    { lat: params.homeAnchor.lat, lng: params.homeAnchor.lng },
  );

  return {
    distanceFromHomeKm: distFromHome,
    isAwayByLocation: distFromHome > TRAVEL_DISTANCE_KM,
    isUserDeclaredPlace: false,
  };
}
