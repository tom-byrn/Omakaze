export interface NeighborhoodSeed {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  center: { lat: number; lng: number };
}

export const NEIGHBORHOODS: NeighborhoodSeed[] = [
  {
    slug: 'harborview',
    name: 'Harborview',
    tagline: 'Waterfront living above the working harbor',
    description:
      'Harborview climbs the bluff above the ferry docks, with brick walk-ups, newer condo towers and a waterfront promenade that runs the length of the neighborhood. Expect sunset views over Ellis Sound and a short walk to the Market Street buses.',
    center: { lat: 47.64112, lng: -122.384 },
  },
  {
    slug: 'old-mill',
    name: 'Old Mill',
    tagline: 'Brick lofts along the Ellis River',
    description:
      'The city’s old textile and timber mills have been converted into lofts, studios and breweries. Old Mill is walkable and creative, with a riverside bike path and the Saturday market at the old foundry.',
    center: { lat: 47.62864, lng: -122.3576 },
  },
  {
    slug: 'kestrel-park',
    name: 'Kestrel Park',
    tagline: 'Leafy streets around the city’s biggest park',
    description:
      'Craftsman bungalows and townhouses ring Kestrel Woods, the 90-acre park at the heart of the neighborhood. Good schools, quiet streets and miles of trails make it a favorite with families.',
    center: { lat: 47.61696, lng: -122.31968 },
  },
  {
    slug: 'ferry-point',
    name: 'Ferry Point',
    tagline: 'A quiet peninsula with the best sunsets',
    description:
      'Ferry Point is a peninsula of shingled cottages and mid-century houses, anchored by the ferry terminal and the lighthouse park at its tip. Beaches, bakeries and a slower pace of life.',
    center: { lat: 47.604, lng: -122.3816 },
  },
  {
    slug: 'larch-hill',
    name: 'Larch Hill',
    tagline: 'Victorian homes and steep, tree-lined streets',
    description:
      'Larch Hill’s Victorian houses and stair streets look out over the city and, on clear days, the Cascades. The reservoir loop at the top of the hill is the city’s favorite running track.',
    center: { lat: 47.6336, lng: -122.31968 },
  },
  {
    slug: 'saltmarsh',
    name: 'Saltmarsh',
    tagline: 'Affordable, artsy and close to the wetlands',
    description:
      'Saltmarsh sits along the south shore wetlands, with boardwalk trails, artist studios in old net warehouses and some of the most affordable rents in Port Ellis.',
    center: { lat: 47.59312, lng: -122.3288 },
  },
  {
    slug: 'canal-district',
    name: 'Canal District',
    tagline: 'Cafés, nightlife and towpath bike lanes',
    description:
      'Built around the 19th-century mill canal, the Canal District is the city’s busiest neighborhood after dark. Rowhouses and brick apartment blocks line the towpath, with bars, bookshops and a Thursday night market.',
    center: { lat: 47.6112, lng: -122.3432 },
  },
  {
    slug: 'northgate',
    name: 'Northgate',
    tagline: 'Transit hub with new construction',
    description:
      'Northgate has grown up around the light rail station: new apartment towers, townhouses and the Northgate Commons park. Downtown is a 20-minute train ride away.',
    center: { lat: 47.6464, lng: -122.3528 },
  },
];
