import type { LaundryType, ParkingType, PetPolicy, PriceEventType, PropertyType } from '@hearth/shared';
import type { AgentKey } from './agents';

/**
 * A price event: the date is either YYYY-MM-DD or a number of days relative to
 * the seed date (negative = in the past). The last `listed` event starts the
 * current listing; its status and prices are derived from the events after it.
 */
export type PriceEventSeed = [date: string | number, event: PriceEventType, price: number];

export interface SaleSeed {
  neighborhood: string;
  propertyType: PropertyType;
  address: string;
  unit?: string;
  beds: number;
  baths: number;
  sqft: number;
  lotSqft?: number;
  yearBuilt: number;
  hoaMonthly: number;
  propertyTaxRate: number;
  lat: number;
  lng: number;
  pets: PetPolicy;
  laundry: LaundryType;
  parking: ParkingType;
  amenities: string[];
  agent: AgentKey;
  description: string;
  history: PriceEventSeed[];
}

const house = { pets: 'cats_dogs', laundry: 'in_unit', hoaMonthly: 0 } as const;

export const SALES: SaleSeed[] = [
  // Harborview
  {
    neighborhood: 'harborview', propertyType: 'condo', address: '2210 Shore Drive', unit: '8A',
    beds: 2, baths: 2, sqft: 1240, yearBuilt: 2019, hoaMonthly: 640, propertyTaxRate: 0.0102,
    lat: 47.64661, lng: -122.3889, pets: 'cats_dogs', laundry: 'in_unit', parking: 'garage', agent: 'maya',
    amenities: ['Water views', 'Balcony', 'Elevator', 'Fitness center', 'Doorman', 'EV charging'],
    description:
      'Eighth-floor corner condo in the Pilot House with a wraparound balcony over the ferry lanes. Open kitchen with a gas range and quartz island, two en-suite bedrooms and a deeded garage space with storage.',
    history: [['2019-08-14', 'sold', 815000], [-21, 'listed', 949000]],
  },
  {
    neighborhood: 'harborview', propertyType: 'townhouse', address: '9 Bell Buoy Lane',
    beds: 3, baths: 2.5, sqft: 1780, lotSqft: 1600, yearBuilt: 2008, hoaMonthly: 180, propertyTaxRate: 0.0101,
    lat: 47.65085, lng: -122.38513, pets: 'cats_dogs', laundry: 'in_unit', parking: 'garage', agent: 'maya',
    amenities: ['Water views', 'Rooftop deck', 'Fireplace', 'Dishwasher', 'EV charging', 'Storage unit'],
    description:
      'Three-story townhouse at the quiet north end of Harborview, with Sound views from the living room and the roof deck. Gas fireplace, a cook’s kitchen and a two-car tandem garage.',
    history: [['2014-06-02', 'listed', 689000], ['2014-07-01', 'sold', 702000], [-34, 'listed', 1250000], [-9, 'pending', 1250000]],
  },
  {
    neighborhood: 'harborview', propertyType: 'condo', address: '520 Pilot Avenue', unit: '3C',
    beds: 1, baths: 1, sqft: 760, yearBuilt: 1927, hoaMonthly: 410, propertyTaxRate: 0.0099,
    lat: 47.6393, lng: -122.3787, pets: 'cats', laundry: 'shared', parking: 'street', agent: 'sam',
    amenities: ['Hardwood floors', 'Dishwasher', 'Courtyard', 'Bike storage'],
    description:
      'Light-filled one-bedroom in a 1927 brick building two blocks from the waterfront promenade. Original oak floors, a renovated kitchen and bath, and a shared courtyard garden.',
    history: [
      ['2012-03-20', 'listed', 268000], ['2012-04-30', 'sold', 259000],
      ['2018-09-05', 'listed', 455000], ['2018-10-02', 'sold', 462000],
      [-48, 'listed', 579000], [-17, 'price_change', 559000],
    ],
  },
  {
    ...house, neighborhood: 'harborview', propertyType: 'house', address: '44 Lookout Street',
    beds: 3, baths: 2, sqft: 1920, lotSqft: 4800, yearBuilt: 1924, propertyTaxRate: 0.0104,
    lat: 47.64991, lng: -122.37838, parking: 'garage', agent: 'maya',
    amenities: ['Water views', 'Fireplace', 'Yard', 'Garden', 'Hardwood floors'],
    description:
      'Craftsman on the bluff with an enclosed sun porch facing the Sound, built-ins throughout and a detached garage converted into a studio.',
    history: [['2009-05-11', 'listed', 525000], ['2009-06-19', 'sold', 510000], [-62, 'listed', 1150000], [-47, 'pending', 1150000], [-20, 'sold', 1184000]],
  },

  // Old Mill
  {
    neighborhood: 'old-mill', propertyType: 'loft', address: '200 Millrace Road', unit: 'Loft 11',
    beds: 2, baths: 2, sqft: 1380, yearBuilt: 1896, hoaMonthly: 520, propertyTaxRate: 0.0103,
    lat: 47.62176, lng: -122.36447, pets: 'cats_dogs', laundry: 'in_unit', parking: 'garage', agent: 'daniel',
    amenities: ['Exposed brick', 'High ceilings', 'Elevator', 'River views', 'Bike storage'],
    description:
      'Corner loft in the converted Millrace textile mill with 14-foot timber ceilings, steel windows on two sides and polished concrete floors. Two bedrooms behind sliding steel doors and a deeded garage space.',
    history: [['2016-02-18', 'listed', 489000], ['2016-03-22', 'sold', 505000], [-6, 'listed', 849000]],
  },
  {
    ...house, neighborhood: 'old-mill', propertyType: 'townhouse', address: '15 Foundry Street',
    beds: 2, baths: 1.5, sqft: 1240, lotSqft: 1400, yearBuilt: 1910, propertyTaxRate: 0.0101,
    lat: 47.62703, lng: -122.3578, parking: 'street', agent: 'daniel',
    amenities: ['Private patio', 'Hardwood floors', 'Dishwasher', 'Exposed brick'],
    description:
      'Brick rowhouse a block from the Saturday market, with a sunny walled patio, an updated kitchen and original pine floors upstairs.',
    history: [['2015-07-07', 'listed', 398000], ['2015-08-10', 'sold', 412000], [-27, 'listed', 725000], [-8, 'price_change', 709000]],
  },
  {
    neighborhood: 'old-mill', propertyType: 'loft', address: '8 Spindle Lane', unit: 'Loft 3',
    beds: 1, baths: 1, sqft: 980, yearBuilt: 1902, hoaMonthly: 455, propertyTaxRate: 0.0102,
    lat: 47.63263, lng: -122.34533, pets: 'cats_dogs', laundry: 'in_unit', parking: 'street', agent: 'daniel',
    amenities: ['Skylights', 'Exposed brick', 'High ceilings', 'Bike storage'],
    description:
      'Top-floor loft in the Spindle Works with two skylights, a sleeping mezzanine and arched windows over Old Mill Green.',
    history: [['2017-11-02', 'listed', 459000], ['2017-12-15', 'sold', 451000], [-55, 'listed', 639000], [-41, 'pending', 639000], [-14, 'sold', 652000]],
  },

  // Kestrel Park
  {
    ...house, neighborhood: 'kestrel-park', propertyType: 'house', address: '37 Meadowlark Drive',
    beds: 4, baths: 2.5, sqft: 2380, lotSqft: 6500, yearBuilt: 1931, propertyTaxRate: 0.0108,
    lat: 47.59992, lng: -122.32378, parking: 'garage', agent: 'grace',
    amenities: ['Yard', 'Fireplace', 'Garden', 'Hardwood floors', 'Central air'],
    description:
      'Tudor revival two blocks from Kestrel Woods, with leaded windows, a wood-burning fireplace and a deep, sunny backyard with a vegetable garden.',
    history: [['2011-04-15', 'listed', 548000], ['2011-05-20', 'sold', 561000], [-26, 'listed', 1195000], [-10, 'pending', 1195000]],
  },
  {
    ...house, neighborhood: 'kestrel-park', propertyType: 'house', address: '19 Wren Street',
    beds: 3, baths: 2, sqft: 1740, lotSqft: 5200, yearBuilt: 1926, propertyTaxRate: 0.0107,
    lat: 47.60429, lng: -122.32936, parking: 'garage', agent: 'grace',
    amenities: ['Yard', 'Fireplace', 'Hardwood floors', 'Dishwasher', 'Storage unit'],
    description:
      'Craftsman bungalow with a wide front porch, original built-ins and a finished basement with a third bedroom. The backyard backs onto a quiet greenbelt.',
    history: [['2013-08-01', 'listed', 435000], ['2013-09-03', 'sold', 449000], [-12, 'listed', 975000]],
  },
  {
    ...house, neighborhood: 'kestrel-park', propertyType: 'house', address: '88 Kestrel Parkway',
    beds: 5, baths: 3.5, sqft: 3150, lotSqft: 8200, yearBuilt: 2004, propertyTaxRate: 0.0109,
    lat: 47.61489, lng: -122.31483, parking: 'garage', agent: 'grace',
    amenities: ['Yard', 'Central air', 'Fireplace', 'Walk-in closet', 'EV charging', 'Dishwasher'],
    description:
      'Spacious home across from the park’s east meadow with a main-floor guest suite, a family room open to the kitchen and a three-car garage.',
    history: [['2004-10-01', 'sold', 689000], [-52, 'listed', 1490000], [-24, 'price_change', 1435000]],
  },
  {
    neighborhood: 'kestrel-park', propertyType: 'townhouse', address: '4 Aspen Court',
    beds: 3, baths: 2.5, sqft: 1620, lotSqft: 1800, yearBuilt: 2016, hoaMonthly: 225, propertyTaxRate: 0.0105,
    lat: 47.61585, lng: -122.33358, pets: 'cats_dogs', laundry: 'in_unit', parking: 'garage', agent: 'grace',
    amenities: ['Private patio', 'Central air', 'EV charging', 'Dishwasher'],
    description:
      'End-unit townhouse on a car-free court with a private patio, an open main floor and an attached garage with EV charging. Steps from Kestrel Elementary.',
    history: [['2016-05-10', 'sold', 598000], [-13, 'listed', 789000]],
  },
  {
    ...house, neighborhood: 'kestrel-park', propertyType: 'house', address: '26 Larkspur Lane',
    beds: 3, baths: 2.5, sqft: 2060, lotSqft: 6100, yearBuilt: 1952, propertyTaxRate: 0.0106,
    lat: 47.61623, lng: -122.32208, parking: 'garage', agent: 'grace',
    amenities: ['Yard', 'Garden', 'Fireplace', 'Skylights', 'Central air'],
    description:
      'Mid-century rambler with walls of glass onto a mature garden, a vaulted living room and a modernized kitchen.',
    history: [['2008-03-14', 'listed', 459000], ['2008-05-02', 'sold', 441000], [-58, 'listed', 1085000], [-44, 'pending', 1085000], [-16, 'sold', 1112000]],
  },

  // Ferry Point
  {
    ...house, neighborhood: 'ferry-point', propertyType: 'house', address: '120 Ferry Road',
    beds: 2, baths: 1, sqft: 1080, lotSqft: 3900, yearBuilt: 1928, propertyTaxRate: 0.0099,
    lat: 47.60686, lng: -122.37526, parking: 'off_street', agent: 'sam',
    amenities: ['Wood stove', 'Garden', 'Yard', 'Hardwood floors'],
    description:
      'Shingled cottage near the bakeries on Ferry Road, with a cozy wood stove, a sunroom and a deep garden with raised beds.',
    history: [['2014-09-09', 'listed', 329000], ['2014-10-15', 'sold', 335000], [-5, 'listed', 719000]],
  },
  {
    ...house, neighborhood: 'ferry-point', propertyType: 'house', address: '15 Tidewater Drive',
    beds: 4, baths: 3, sqft: 2640, lotSqft: 7400, yearBuilt: 1962, propertyTaxRate: 0.0104,
    lat: 47.58832, lng: -122.3808, parking: 'garage', agent: 'sam',
    amenities: ['Water views', 'Fireplace', 'Yard', 'Kayak storage', 'Deck'],
    description:
      'Mid-century home on the south shore with a wall of windows onto the water, a sunken living room with a brick fireplace and a private path down to the beach.',
    history: [['2019-06-21', 'listed', 915000], ['2019-07-30', 'sold', 940000], [-31, 'listed', 1325000], [-7, 'price_change', 1295000]],
  },
  {
    neighborhood: 'ferry-point', propertyType: 'townhouse', address: '31 Wharfside Row',
    beds: 3, baths: 2.5, sqft: 1560, lotSqft: 1500, yearBuilt: 2012, hoaMonthly: 190, propertyTaxRate: 0.01,
    lat: 47.61337, lng: -122.37836, pets: 'cats_dogs', laundry: 'in_unit', parking: 'garage', agent: 'sam',
    amenities: ['Rooftop deck', 'Water views', 'Dishwasher', 'EV charging'],
    description:
      'Modern townhouse near the river mouth with a roof deck, an open main floor and a tandem garage with room for bikes and kayaks.',
    history: [['2012-11-01', 'sold', 455000], [-29, 'listed', 815000], [-6, 'pending', 815000]],
  },
  {
    ...house, neighborhood: 'ferry-point', propertyType: 'house', address: '1 Lighthouse Way',
    beds: 3, baths: 2, sqft: 1690, lotSqft: 6800, yearBuilt: 1948, propertyTaxRate: 0.0103,
    lat: 47.59468, lng: -122.39122, parking: 'off_street', agent: 'sam',
    amenities: ['Water views', 'Yard', 'Garden', 'Wood stove'],
    description:
      'The former lighthouse keeper’s house, restored with care: beadboard ceilings, a sunny kitchen and a lawn that runs down to the lighthouse park.',
    history: [
      ['2010-08-12', 'listed', 489000], ['2010-10-01', 'sold', 472000],
      [-70, 'listed', 1095000], [-52, 'price_change', 1059000], [-38, 'pending', 1059000], [-11, 'sold', 1050000],
    ],
  },

  // Larch Hill
  {
    neighborhood: 'larch-hill', propertyType: 'condo', address: '610 Larch Street', unit: '2',
    beds: 2, baths: 1, sqft: 960, yearBuilt: 1905, hoaMonthly: 380, propertyTaxRate: 0.0102,
    lat: 47.62622, lng: -122.33214, pets: 'cats', laundry: 'shared', parking: 'street', agent: 'priya',
    amenities: ['Bay windows', 'Fireplace', 'Hardwood floors', 'Garden'],
    description:
      'Second-floor flat in a converted 1905 Victorian with a bay window, a decorative fireplace and a shared garden. Old Mill is a five-minute walk downhill.',
    history: [['2015-04-14', 'listed', 348000], ['2015-05-12', 'sold', 361000], [-9, 'listed', 639000]],
  },
  {
    ...house, neighborhood: 'larch-hill', propertyType: 'house', address: '5 Reservoir Lane',
    beds: 4, baths: 3, sqft: 2860, lotSqft: 6200, yearBuilt: 1912, propertyTaxRate: 0.0109,
    lat: 47.65221, lng: -122.33109, parking: 'garage', agent: 'priya',
    amenities: ['Mountain views', 'Fireplace', 'Hardwood floors', 'Garden', 'Claw-foot tub'],
    description:
      'Grand foursquare overlooking the reservoir with a formal dining room, a library lined with built-in shelves and a carriage-house garage with a studio above.',
    history: [['2006-06-06', 'listed', 710000], ['2006-07-21', 'sold', 735000], [-40, 'listed', 1795000], [-13, 'price_change', 1749000]],
  },
  {
    ...house, neighborhood: 'larch-hill', propertyType: 'house', address: '22 Summit Avenue',
    beds: 4, baths: 2.5, sqft: 2480, lotSqft: 5000, yearBuilt: 1898, propertyTaxRate: 0.0108,
    lat: 47.64247, lng: -122.33044, parking: 'off_street', agent: 'priya',
    amenities: ['Mountain views', 'Fireplace', 'Bay windows', 'Claw-foot tub', 'Hardwood floors', 'Garden'],
    description:
      'Queen Anne with a turret, a wraparound porch and pocket doors, restored down to the stained glass. Views east to the Cascades from the primary suite.',
    history: [['2013-02-01', 'listed', 820000], ['2013-03-15', 'sold', 845000], [-66, 'listed', 1495000], [-49, 'pending', 1495000], [-25, 'sold', 1530000]],
  },
  {
    ...house, neighborhood: 'larch-hill', propertyType: 'house', address: '11 Juniper Steps',
    beds: 3, baths: 2, sqft: 1640, lotSqft: 3100, yearBuilt: 2018, propertyTaxRate: 0.0106,
    lat: 47.62746, lng: -122.32066, parking: 'street', agent: 'priya',
    amenities: ['Mountain views', 'Skylights', 'Deck', 'Central air', 'Dishwasher'],
    description:
      'Modern infill on one of the hill’s stair streets: a cedar-clad house with a double-height living room, treetop views and a lofted office.',
    history: [['2018-11-20', 'sold', 889000], [-1, 'listed', 1189000]],
  },
  {
    neighborhood: 'larch-hill', propertyType: 'townhouse', address: '3 Hilltop Terrace',
    beds: 3, baths: 2.5, sqft: 1910, lotSqft: 1700, yearBuilt: 1999, hoaMonthly: 260, propertyTaxRate: 0.0105,
    lat: 47.6384, lng: -122.31694, pets: 'cats_dogs', laundry: 'in_unit', parking: 'garage', agent: 'priya',
    amenities: ['Mountain views', 'Deck', 'Fireplace', 'Storage unit', 'Dishwasher'],
    description:
      'Hillside townhouse with views from every level, a sunny deck off the kitchen and a two-car garage. The reservoir loop starts at the end of the street.',
    history: [['2007-03-03', 'listed', 515000], ['2007-04-11', 'sold', 529000], [-2, 'listed', 975000]],
  },

  // Saltmarsh
  {
    ...house, neighborhood: 'saltmarsh', propertyType: 'house', address: '9 Egret Court',
    beds: 3, baths: 1.5, sqft: 1280, lotSqft: 5600, yearBuilt: 1958, propertyTaxRate: 0.0098,
    lat: 47.59324, lng: -122.34763, parking: 'off_street', agent: 'tomas',
    amenities: ['Yard', 'Garden', 'Storage unit', 'Dishwasher'],
    description:
      'Ranch house on a cul-de-sac near the marsh boardwalk, with a big fenced yard, a sunny kitchen and a detached workshop.',
    history: [['2012-05-25', 'listed', 189000], ['2012-07-02', 'sold', 184000], [-22, 'listed', 549000], [-5, 'price_change', 535000]],
  },
  {
    neighborhood: 'saltmarsh', propertyType: 'townhouse', address: '250 Tern Avenue',
    beds: 2, baths: 2, sqft: 1140, lotSqft: 1300, yearBuilt: 2021, hoaMonthly: 165, propertyTaxRate: 0.0099,
    lat: 47.59509, lng: -122.33279, pets: 'cats_dogs', laundry: 'in_unit', parking: 'off_street', agent: 'tomas',
    amenities: ['Balcony', 'Central air', 'EV charging', 'Dishwasher'],
    description:
      'Nearly new townhouse with an open main floor, a balcony over the reed beds and solar panels on the roof.',
    history: [['2021-09-15', 'sold', 455000], [-10, 'listed', 489000]],
  },
  {
    neighborhood: 'saltmarsh', propertyType: 'condo', address: '1200 Reed Street', unit: '3B',
    beds: 1, baths: 1, sqft: 720, yearBuilt: 2022, hoaMonthly: 365, propertyTaxRate: 0.0099,
    lat: 47.59127, lng: -122.32327, pets: 'cats_dogs', laundry: 'in_unit', parking: 'garage', agent: 'tomas',
    amenities: ['Elevator', 'Fitness center', 'Co-working lounge', 'Package lockers'],
    description:
      'Bright one-bedroom in Saltmarsh’s newest mid-rise, with in-unit laundry, a co-working lounge downstairs and garage parking.',
    history: [['2022-06-01', 'sold', 372000], [-48, 'listed', 399000], [-30, 'pending', 399000], [-9, 'sold', 404000]],
  },

  // Canal District
  {
    neighborhood: 'canal-district', propertyType: 'condo', address: '2 Bridge Street', unit: '504',
    beds: 2, baths: 2, sqft: 1020, yearBuilt: 2015, hoaMonthly: 590, propertyTaxRate: 0.0103,
    lat: 47.60945, lng: -122.36396, pets: 'cats_dogs', laundry: 'in_unit', parking: 'garage', agent: 'elena',
    amenities: ['River views', 'Balcony', 'Elevator', 'Doorman', 'Fitness center'],
    description:
      'Fifth-floor condo where the canal meets the river, with a long balcony, a split-bedroom plan and a concierge desk downstairs.',
    history: [['2015-10-10', 'sold', 535000], [-36, 'listed', 689000], [-15, 'price_change', 669000]],
  },
  {
    ...house, neighborhood: 'canal-district', propertyType: 'townhouse', address: '17 Lockkeeper Row',
    beds: 3, baths: 2, sqft: 1410, lotSqft: 1100, yearBuilt: 1874, propertyTaxRate: 0.0102,
    lat: 47.61567, lng: -122.34941, parking: 'street', agent: 'elena',
    amenities: ['Rooftop deck', 'Wood stove', 'Exposed brick', 'Garden'],
    description:
      'One of the original lockkeepers’ cottages, carefully expanded to three stories with a roof deck over the canal. Exposed beams, a cast-iron stove and a tiny walled garden.',
    history: [['2011-01-20', 'listed', 389000], ['2011-03-01', 'sold', 401000], [-14, 'listed', 879000]],
  },
  {
    neighborhood: 'canal-district', propertyType: 'condo', address: '155 Barge Avenue', unit: '4B',
    beds: 1, baths: 1, sqft: 690, yearBuilt: 1912, hoaMonthly: 340, propertyTaxRate: 0.0101,
    lat: 47.60138, lng: -122.36066, pets: 'cats', laundry: 'shared', parking: 'none', agent: 'elena',
    amenities: ['Hardwood floors', 'High ceilings', 'Rooftop deck'],
    description:
      'Top-floor one-bedroom above the bookshop on Barge Avenue, with tall windows, refinished fir floors and a shared roof terrace.',
    history: [['2016-04-04', 'listed', 299000], ['2016-05-06', 'sold', 312000], [-44, 'listed', 469000], [-28, 'pending', 469000], [-6, 'sold', 481000]],
  },

  // Northgate
  {
    neighborhood: 'northgate', propertyType: 'condo', address: '1 Station Avenue', unit: '1705',
    beds: 2, baths: 2, sqft: 1090, yearBuilt: 2023, hoaMonthly: 615, propertyTaxRate: 0.0104,
    lat: 47.6474, lng: -122.3514, pets: 'cats_dogs', laundry: 'in_unit', parking: 'garage', agent: 'marcus',
    amenities: ['Elevator', 'Fitness center', 'Co-working lounge', 'Central air', 'Rooftop deck'],
    description:
      'Seventeenth-floor corner condo above Northgate Station with floor-to-ceiling glass, central air and a full amenity floor.',
    history: [['2023-03-01', 'sold', 612000], [-17, 'listed', 659000]],
  },
  {
    neighborhood: 'northgate', propertyType: 'townhouse', address: '41 Signal Street',
    beds: 3, baths: 2.5, sqft: 1700, lotSqft: 1500, yearBuilt: 2024, hoaMonthly: 210, propertyTaxRate: 0.0103,
    lat: 47.63819, lng: -122.35976, pets: 'cats_dogs', laundry: 'in_unit', parking: 'garage', agent: 'marcus',
    amenities: ['Private patio', 'Central air', 'EV charging', 'Dishwasher'],
    description:
      'Two-year-old townhouse with an attached garage, central air and a patio off the kitchen, a five-minute walk from the station.',
    history: [['2024-05-15', 'sold', 779000], [-24, 'listed', 829000], [-5, 'pending', 829000]],
  },
  {
    neighborhood: 'northgate', propertyType: 'condo', address: '88 Commons Place', unit: '210',
    beds: 1, baths: 1, sqft: 740, yearBuilt: 2019, hoaMonthly: 395, propertyTaxRate: 0.0102,
    lat: 47.64266, lng: -122.34782, pets: 'cats_dogs', laundry: 'in_unit', parking: 'garage', agent: 'marcus',
    amenities: ['Balcony', 'Elevator', 'Fitness center', 'Storage unit'],
    description:
      'Quiet one-bedroom overlooking Northgate Commons, with a balcony, in-unit laundry and a storage locker.',
    history: [['2019-09-09', 'sold', 389000], [-53, 'listed', 459000], [-37, 'price_change', 445000], [-25, 'pending', 445000], [-8, 'sold', 441000]],
  },
];
