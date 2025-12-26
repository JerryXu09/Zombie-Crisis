import { Coordinates, Building } from '../types';

interface CacheEntry {
  name: string;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

export interface LocationInfo {
  name: string;
  road?: string;
  suburb?: string;
  neighborhood?: string;
  feature?: string; // specific building/POI name
  type?: string;    // highway, shop, etc.
}

// Round coordinates to ~10m precision to increase cache hits
const getCacheKey = (coords: Coordinates) => {
  return `${coords.lat.toFixed(4)},${coords.lng.toFixed(4)}`;
};

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1100; // 1.1s to be safe (OSM limit is 1s)

const throttleRequest = async () => {
  const now = Date.now();
  const timeSinceLast = now - lastRequestTime;
  if (timeSinceLast < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLast));
  }
  lastRequestTime = Date.now();
};

export const mapDataService = {
  async getLocationInfo(coords: Coordinates): Promise<LocationInfo | null> {
    const key = getCacheKey(coords);
    const cached = cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      try {
        return JSON.parse(cached.name) as LocationInfo;
      } catch {
        return { name: cached.name };
      }
    }

    try {
      await throttleRequest();
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lng}&format=json&zoom=18&addressdetails=1`;
      
      const response = await fetch(url, {
        headers: {
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'User-Agent': 'Zombie-Crisis-Game-Bot'
        }
      });

      if (!response.ok) throw new Error('Network response was not ok');
      
      const data = await response.json();
      const address = data.address;
      
      if (!address) return null;

      const info: LocationInfo = {
        name: data.display_name.split(',')[0],
        road: address.road || address.pedestrian,
        suburb: address.suburb || address.neighborhood || address.neighbourhood,
        neighborhood: address.neighborhood || address.neighbourhood,
        feature: data.name || address.amenity || address.shop || address.tourism || address.building,
        type: data.type
      };

      // Flatten name to something short and readable
      info.name = info.feature || info.road || info.suburb || data.display_name.split(',')[0];

      cache.set(key, { name: JSON.stringify(info), timestamp: Date.now() });
      return info;
    } catch (error) {
      console.error('MapDataService Error:', error);
      return null;
    }
  },

  async getNearbyLocationName(coords: Coordinates): Promise<string | null> {
    const info = await this.getLocationInfo(coords);
    return info ? info.name : null;
  },

  async getNearbyFeatures(coords: Coordinates): Promise<string[]> {
    try {
      await throttleRequest();
      // Overpass API is better for getting a list of features
      // Query nodes with names within 500m
      const url = `https://overpass-api.de/api/interpreter?data=[out:json];node(around:500,${coords.lat},${coords.lng})[name];out;`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Overpass Network response was not ok');
      
      const data = await response.json();
      const names = data.elements
        .map((e: any) => e.tags.name)
        .filter((name: string) => name && name.length > 1);
        
      // Remove duplicates
      return Array.from(new Set(names)) as string[];
    } catch (error) {
      console.error('Overpass Error:', error);
      return [];
    }
  },

  async getBuildingGeometries(coords: Coordinates): Promise<Building[]> {
    try {
      await throttleRequest();
      // Fetch buildings within 400m (reduced from 600m to avoid timeouts)
      const url = `https://overpass-api.de/api/interpreter?data=[out:json];(way(around:400,${coords.lat},${coords.lng})[building];);out geom;`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Overpass Network response was not ok: ${response.status}`);
      
      const data = await response.json();
      const buildings: Building[] = data.elements
        .filter((e: any) => e.type === 'way' && e.geometry)
        .map((e: any) => ({
          id: `building-${e.id}`,
          geometry: e.geometry.map((pt: any) => ({ lat: pt.lat, lng: pt.lon })),
          tags: e.tags || {},
          name: e.tags?.name || e.tags?.['name:zh'] || e.tags?.['name:en'] || '普通建筑',
          type: e.tags?.building || 'building'
        }));
        
      return buildings;
    } catch (error) {
      console.error('getBuildingGeometries Error:', error);
      return [];
    }
  }
};
