import type { LaundryType, ParkingType, PetPolicy, PropertyType } from '@hearth/shared';
import type { AgentKey } from './agents';

export interface RentalSeed {
  neighborhood: string;
  propertyType: PropertyType;
  address: string;
  unit?: string;
  rent: number;
  /** Defaults to one month's rent. */
  deposit?: number;
  beds: number;
  baths: number;
  sqft: number;
  lat: number;
  lng: number;
  /** Days from the seed date; zero or negative means available now. */
  availableInDays: number;
  listedDaysAgo: number;
  leaseTermMonths?: number;
  pets: PetPolicy;
  laundry: LaundryType;
  parking: ParkingType;
  amenities: string[];
  agent: AgentKey;
  description: string;
}

export const RENTALS: RentalSeed[] = [
  // Harborview
  {
    neighborhood: 'harborview', propertyType: 'condo', address: '1180 Shore Drive', unit: '6C',
    rent: 3850, deposit: 5000, beds: 2, baths: 2, sqft: 1120, lat: 47.63677, lng: -122.39483,
    availableInDays: 14, listedDaysAgo: 2, pets: 'cats', laundry: 'in_unit', parking: 'garage',
    amenities: ['Water views', 'Balcony', 'Elevator', 'Fitness center', 'Dishwasher', 'Package lockers'],
    agent: 'maya',
    description:
      'Corner unit on the sixth floor with floor-to-ceiling windows facing Ellis Sound. Watch the ferries come in from the balcony, cook on a gas range with a waterfront view and park in the secured garage below. The building has a fitness room and a 24-hour package room.',
  },
  {
    neighborhood: 'harborview', propertyType: 'apartment', address: '418 Pilot Avenue', unit: '3B',
    rent: 2450, beds: 1, baths: 1, sqft: 720, lat: 47.63641, lng: -122.37814,
    availableInDays: -3, listedDaysAgo: 6, pets: 'cats_dogs', laundry: 'shared', parking: 'street',
    amenities: ['Hardwood floors', 'Dishwasher', 'Bike storage', 'Courtyard'],
    agent: 'maya',
    description:
      'Sunny one-bedroom in a 1920s brick walk-up two blocks from the waterfront promenade. Original hardwood floors, a renovated kitchen with dishwasher and a quiet courtyard. Market Street buses stop at the corner.',
  },
  {
    neighborhood: 'harborview', propertyType: 'apartment', address: '72 Lantern Way', unit: '501',
    rent: 1980, beds: 0, baths: 1, sqft: 520, lat: 47.64026, lng: -122.3901,
    availableInDays: 9, listedDaysAgo: 11, pets: 'cats', laundry: 'shared', parking: 'none',
    amenities: ['Water views', 'Elevator', 'Rooftop deck', 'Package lockers'],
    agent: 'sam',
    description:
      'Efficient top-floor studio with a peek of the Sound from the window seat. The shared rooftop deck has grills and the best sunset view in Harborview. A Murphy bed and built-in shelving make the most of every square foot.',
  },
  {
    neighborhood: 'harborview', propertyType: 'townhouse', address: '15 Bell Buoy Lane',
    rent: 4200, deposit: 6300, beds: 3, baths: 2.5, sqft: 1640, lat: 47.65295, lng: -122.38647,
    availableInDays: 30, listedDaysAgo: 12, pets: 'cats_dogs', laundry: 'in_unit', parking: 'garage',
    amenities: ['Private patio', 'Fireplace', 'Water views', 'Dishwasher', 'EV charging', 'Storage unit'],
    agent: 'maya',
    description:
      'Three-level townhouse at the quiet north end of Harborview. The living room’s gas fireplace faces a west-facing patio, and the primary suite has a soaking tub and a view across the water. Attached one-car garage with an EV charger.',
  },
  {
    neighborhood: 'harborview', propertyType: 'apartment', address: '906 Quay Street', unit: '2A',
    rent: 2950, beds: 2, baths: 1, sqft: 880, lat: 47.6263, lng: -122.38038,
    availableInDays: 10, listedDaysAgo: 4, pets: 'cats_dogs', laundry: 'in_unit', parking: 'off_street',
    amenities: ['Dishwasher', 'Balcony', 'Bike storage', 'Storage unit'],
    agent: 'sam',
    description:
      'Bright two-bedroom near the river mouth with a small balcony over a tree-lined street. Both bedrooms fit a queen bed, and the stacked washer and dryer are in the unit. One assigned parking space included.',
  },

  // Old Mill
  {
    neighborhood: 'old-mill', propertyType: 'loft', address: '200 Millrace Road', unit: 'Loft 4',
    rent: 2950, beds: 1, baths: 1, sqft: 1050, lat: 47.62484, lng: -122.35978,
    availableInDays: 21, listedDaysAgo: 1, pets: 'cats_dogs', laundry: 'in_unit', parking: 'garage',
    amenities: ['Exposed brick', 'High ceilings', 'Stainless appliances', 'Elevator', 'Bike storage'],
    agent: 'daniel',
    description:
      'Converted textile-mill loft with 14-foot timber ceilings, exposed brick and steel-framed windows. The open kitchen has a long concrete island, and the sleeping area is tucked behind sliding barn doors. Garage parking and a riverside bike path out front.',
  },
  {
    neighborhood: 'old-mill', propertyType: 'apartment', address: '38 Foundry Street', unit: '2',
    rent: 2600, beds: 2, baths: 1, sqft: 910, lat: 47.63399, lng: -122.36055,
    availableInDays: 0, listedDaysAgo: 9, pets: 'cats', laundry: 'shared', parking: 'street',
    amenities: ['Hardwood floors', 'Bay windows', 'Dishwasher'],
    agent: 'daniel',
    description:
      'Second floor of a classic Old Mill duplex with bay windows, a built-in hutch and a sunny breakfast nook. Half a block from the Market Street cafés and the Saturday market at the old foundry.',
  },
  {
    neighborhood: 'old-mill', propertyType: 'loft', address: '11 Spindle Lane', unit: 'Loft 7',
    rent: 2200, beds: 0, baths: 1, sqft: 780, lat: 47.62573, lng: -122.35106,
    availableInDays: -5, listedDaysAgo: 15, pets: 'cats', laundry: 'shared', parking: 'street',
    amenities: ['Exposed brick', 'High ceilings', 'Skylights', 'Bike storage'],
    agent: 'daniel',
    description:
      'Open studio loft on the top floor of the Spindle Works building. Two skylights and a wall of original arched windows flood the space with light — ideal for a home studio. Shared laundry and a bike room downstairs.',
  },
  {
    neighborhood: 'old-mill', propertyType: 'townhouse', address: '77 Wheelhouse Avenue',
    rent: 3150, beds: 2, baths: 1.5, sqft: 1180, lat: 47.63405, lng: -122.34027,
    availableInDays: 7, listedDaysAgo: 3, pets: 'cats_dogs', laundry: 'in_unit', parking: 'off_street',
    amenities: ['Private patio', 'Dishwasher', 'Hardwood floors', 'Storage unit', 'Garden'],
    agent: 'daniel',
    description:
      'Two-story brick townhouse on a quiet block near Old Mill Green. Updated kitchen, a half bath on the main floor and a fenced patio with raised garden beds. One off-street parking space.',
  },
  {
    neighborhood: 'old-mill', propertyType: 'loft', address: '5 Weir Street', unit: 'Loft 12',
    rent: 3700, deposit: 5550, beds: 2, baths: 2, sqft: 1420, lat: 47.62065, lng: -122.36868,
    availableInDays: 30, listedDaysAgo: 5, pets: 'cats_dogs', laundry: 'in_unit', parking: 'garage',
    amenities: ['River views', 'Exposed brick', 'High ceilings', 'Elevator', 'Fitness center', 'Rooftop deck'],
    agent: 'daniel',
    description:
      'Corner loft overlooking the Ellis River with two true bedrooms and two full baths. Heavy timber beams, polished concrete floors and an oversized kitchen. Residents share a rooftop deck with river views.',
  },

  // Kestrel Park
  {
    neighborhood: 'kestrel-park', propertyType: 'house', address: '24 Meadowlark Drive',
    rent: 4100, deposit: 6150, beds: 3, baths: 2, sqft: 1760, lat: 47.60153, lng: -122.32264,
    availableInDays: 25, listedDaysAgo: 7, pets: 'cats_dogs', laundry: 'in_unit', parking: 'garage',
    amenities: ['Yard', 'Fireplace', 'Dishwasher', 'Central air', 'Garden', 'Storage unit'],
    agent: 'grace',
    description:
      'Craftsman bungalow with a deep front porch and a fenced backyard full of fruit trees. Three bedrooms on the main floor, a finished basement den and a detached garage. Two blocks from the Kestrel Woods trailhead.',
  },
  {
    neighborhood: 'kestrel-park', propertyType: 'apartment', address: '300 Kestrel Avenue', unit: '4D',
    rent: 2150, beds: 1, baths: 1, sqft: 690, lat: 47.6196, lng: -122.32985,
    availableInDays: 5, listedDaysAgo: 2, pets: 'cats', laundry: 'shared', parking: 'off_street',
    amenities: ['Balcony', 'Dishwasher', 'Fitness center', 'Package lockers', 'Elevator'],
    agent: 'grace',
    description:
      'Quiet one-bedroom facing the treetops of Kestrel Woods, with a balcony big enough for a bistro table. The building has an elevator, a small gym and secure package lockers.',
  },
  {
    neighborhood: 'kestrel-park', propertyType: 'townhouse', address: '8 Aspen Court',
    rent: 3600, beds: 3, baths: 2.5, sqft: 1580, lat: 47.61335, lng: -122.33118,
    availableInDays: 14, listedDaysAgo: 11, pets: 'cats_dogs', laundry: 'in_unit', parking: 'garage',
    amenities: ['Private patio', 'Dishwasher', 'Central air', 'EV charging'],
    agent: 'grace',
    description:
      'End-unit townhouse on a car-free court shared with five neighbors. Open main floor with a kitchen island, three bedrooms upstairs and an attached garage with an EV charger. Steps from Kestrel Elementary.',
  },
  {
    neighborhood: 'kestrel-park', propertyType: 'apartment', address: '1450 Birchwood Lane', unit: '1C',
    rent: 2750, beds: 2, baths: 2, sqft: 980, lat: 47.60629, lng: -122.33237,
    availableInDays: -2, listedDaysAgo: 18, pets: 'cats_dogs', laundry: 'in_unit', parking: 'off_street',
    amenities: ['Private patio', 'Dishwasher', 'Pet wash station', 'Bike storage'],
    agent: 'grace',
    description:
      'Ground-floor two-bedroom with a private patio that opens straight onto the building’s garden. Split-bedroom layout with a bathroom for each. Dog-friendly building with a pet wash station.',
  },
  {
    neighborhood: 'kestrel-park', propertyType: 'house', address: '61 Kestrel Parkway',
    rent: 4800, deposit: 7200, beds: 4, baths: 3, sqft: 2250, lat: 47.61804, lng: -122.32137,
    availableInDays: 45, listedDaysAgo: 4, leaseTermMonths: 24, pets: 'cats_dogs', laundry: 'in_unit', parking: 'garage',
    amenities: ['Yard', 'Fireplace', 'Central air', 'Dishwasher', 'Garden', 'Walk-in closet'],
    agent: 'grace',
    description:
      'Spacious four-bedroom colonial across from the park’s north meadow. Formal dining room, an updated kitchen with breakfast bar and a primary suite with walk-in closet. Big, flat backyard and a two-car garage.',
  },

  // Ferry Point
  {
    neighborhood: 'ferry-point', propertyType: 'house', address: '9 Gull Lane',
    rent: 2850, beds: 2, baths: 1, sqft: 1050, lat: 47.59144, lng: -122.38912,
    availableInDays: 20, listedDaysAgo: 10, pets: 'cats_dogs', laundry: 'in_unit', parking: 'off_street',
    amenities: ['Water views', 'Yard', 'Wood stove', 'Garden'],
    agent: 'sam',
    description:
      'Shingled cottage on the bluff with a wood stove, window seats and a view straight down the Sound. The garden has a fire pit and a path to the beach stairs. Ten minutes’ walk to the ferry terminal.',
  },
  {
    neighborhood: 'ferry-point', propertyType: 'apartment', address: '220 Ferry Road', unit: '3',
    rent: 1850, beds: 1, baths: 1, sqft: 650, lat: 47.60309, lng: -122.38767,
    availableInDays: 0, listedDaysAgo: 3, pets: 'cats', laundry: 'shared', parking: 'street',
    amenities: ['Hardwood floors', 'Bike storage', 'Gas range'],
    agent: 'sam',
    description:
      'Cozy third-floor walk-up above Ferry Road’s bakery row. Hardwood floors, a renovated bath and a kitchen with a gas range. The Shore Drive bus and the ferry dock are both a short walk away.',
  },
  {
    neighborhood: 'ferry-point', propertyType: 'house', address: '3 Lighthouse Way',
    rent: 3500, beds: 3, baths: 2, sqft: 1480, lat: 47.59045, lng: -122.39737,
    availableInDays: 30, listedDaysAgo: 6, pets: 'cats_dogs', laundry: 'in_unit', parking: 'garage',
    amenities: ['Water views', 'Fireplace', 'Yard', 'Kayak storage', 'Dishwasher'],
    agent: 'sam',
    description:
      'Light-filled mid-century house near the tip of Ferry Point, a short stroll from the lighthouse park. Vaulted living room with a brick fireplace, a sunroom facing the water and a garage with room for kayaks.',
  },
  {
    neighborhood: 'ferry-point', propertyType: 'townhouse', address: '48 Tidewater Drive',
    rent: 2700, beds: 2, baths: 1.5, sqft: 1100, lat: 47.60605, lng: -122.3829,
    availableInDays: 7, listedDaysAgo: 14, pets: 'cats_dogs', laundry: 'in_unit', parking: 'off_street',
    amenities: ['Private patio', 'Dishwasher', 'Storage unit'],
    agent: 'sam',
    description:
      'Two-bedroom townhouse with a sunny patio off the kitchen and a storage shed for bikes and beach gear. Quiet street near the Ferry Point library and the waterfront trail.',
  },

  // Larch Hill
  {
    neighborhood: 'larch-hill', propertyType: 'house', address: '19 Summit Avenue',
    rent: 4650, deposit: 7000, beds: 4, baths: 2.5, sqft: 2400, lat: 47.63426, lng: -122.3144,
    availableInDays: 40, listedDaysAgo: 8, leaseTermMonths: 18, pets: 'cats_dogs', laundry: 'in_unit', parking: 'off_street',
    amenities: ['Mountain views', 'Fireplace', 'Hardwood floors', 'Claw-foot tub', 'Garden', 'Bay windows'],
    agent: 'priya',
    description:
      'Restored 1898 Queen Anne with a wraparound porch, pocket doors and two original fireplaces. Four bedrooms upstairs — one with a turret reading nook — and a claw-foot tub in the main bath. Views east to the Cascades on clear days.',
  },
  {
    neighborhood: 'larch-hill', propertyType: 'apartment', address: '455 Larch Street', unit: '2R',
    rent: 2250, beds: 1, baths: 1, sqft: 760, lat: 47.62712, lng: -122.32967,
    availableInDays: 10, listedDaysAgo: 5, pets: 'cats', laundry: 'shared', parking: 'street',
    amenities: ['Bay windows', 'Hardwood floors', 'High ceilings'],
    agent: 'priya',
    description:
      'Rear unit on the second floor of a converted Victorian, with tall ceilings, a bay window and an updated kitchen. Quiet, tree-shaded block a short walk downhill to Old Mill.',
  },
  {
    neighborhood: 'larch-hill', propertyType: 'apartment', address: '12 Hilltop Terrace', unit: '1',
    rent: 2700, beds: 2, baths: 1, sqft: 940, lat: 47.63472, lng: -122.32857,
    availableInDays: -7, listedDaysAgo: 20, pets: 'cats_dogs', laundry: 'shared', parking: 'off_street',
    amenities: ['Garden', 'Fireplace', 'Hardwood floors'],
    agent: 'priya',
    description:
      'Garden-level two-bedroom in a 1910 fourplex with a decorative fireplace and direct access to the shared backyard. An off-street parking spot is included, which is rare on the hill.',
  },
  {
    neighborhood: 'larch-hill', propertyType: 'house', address: '7 Juniper Steps',
    rent: 3950, beds: 3, baths: 2, sqft: 1850, lat: 47.62944, lng: -122.32126,
    availableInDays: 21, listedDaysAgo: 2, pets: 'cats_dogs', laundry: 'in_unit', parking: 'street',
    amenities: ['Mountain views', 'Deck', 'Skylights', 'Dishwasher', 'Central air'],
    agent: 'priya',
    description:
      'Modern infill house on one of Larch Hill’s famous stair streets. Skylit open-plan living space, a cedar deck with treetop views and three bedrooms, including a lofted office. Street parking only — the steps are part of the charm.',
  },
  {
    neighborhood: 'larch-hill', propertyType: 'apartment', address: '301 Reservoir Lane', unit: '6',
    rent: 1750, beds: 0, baths: 1, sqft: 480, lat: 47.65183, lng: -122.3273,
    availableInDays: 3, listedDaysAgo: 1, pets: 'cats', laundry: 'shared', parking: 'none',
    amenities: ['Mountain views', 'Hardwood floors'],
    agent: 'priya',
    description:
      'Top-floor studio in a small 1930s building beside the Larch Hill reservoir. Arched windows, original hardwood and a kitchenette with a full-size fridge. Morning runs around the reservoir loop start at the door.',
  },

  // Saltmarsh
  {
    neighborhood: 'saltmarsh', propertyType: 'apartment', address: '64 Heron Way', unit: '210',
    rent: 1650, beds: 1, baths: 1, sqft: 640, lat: 47.58906, lng: -122.36375,
    availableInDays: -1, listedDaysAgo: 6, pets: 'cats_dogs', laundry: 'shared', parking: 'off_street',
    amenities: ['Balcony', 'Bike storage', 'Courtyard'],
    agent: 'tomas',
    description:
      'Affordable one-bedroom in a newer building with a courtyard garden and covered bike parking. The balcony looks out over the reed beds of the marsh preserve.',
  },
  {
    neighborhood: 'saltmarsh', propertyType: 'apartment', address: '1200 Reed Street', unit: '5F',
    rent: 2250, beds: 2, baths: 2, sqft: 960, lat: 47.59032, lng: -122.34042,
    availableInDays: 15, listedDaysAgo: 3, pets: 'cats_dogs', laundry: 'in_unit', parking: 'garage',
    amenities: ['Elevator', 'Fitness center', 'Co-working lounge', 'Dishwasher', 'Package lockers'],
    agent: 'tomas',
    description:
      'Two-bed, two-bath in Saltmarsh’s newest mid-rise, with a co-working lounge, gym and garage parking. In-unit washer and dryer, quartz counters and big windows facing the boardwalk trails.',
  },
  {
    neighborhood: 'saltmarsh', propertyType: 'loft', address: '17 Boardwalk Lane', unit: 'Studio C',
    rent: 1450, beds: 0, baths: 1, sqft: 700, lat: 47.59738, lng: -122.35453,
    availableInDays: -10, listedDaysAgo: 25, pets: 'cats', laundry: 'shared', parking: 'street',
    amenities: ['High ceilings', 'Exposed brick', 'Skylights'],
    agent: 'tomas',
    description:
      'Live/work studio in a former net-mending warehouse that’s now home to a dozen artists. A huge north-facing skylight, sealed concrete floors and a utility sink — paint splatters welcome.',
  },
  {
    neighborhood: 'saltmarsh', propertyType: 'house', address: '5 Egret Court',
    rent: 2950, beds: 3, baths: 1.5, sqft: 1320, lat: 47.59206, lng: -122.35786,
    availableInDays: 30, listedDaysAgo: 9, pets: 'cats_dogs', laundry: 'in_unit', parking: 'off_street',
    amenities: ['Yard', 'Dishwasher', 'Garden', 'Storage unit'],
    agent: 'tomas',
    description:
      'Ranch house with a big fenced yard on a cul-de-sac near the marsh boardwalk. Three bedrooms, a sunny kitchen and a garden shed. Great value for the space.',
  },
  {
    neighborhood: 'saltmarsh', propertyType: 'apartment', address: '390 Tern Avenue', unit: '3C',
    rent: 1950, beds: 2, baths: 1, sqft: 820, lat: 47.59035, lng: -122.3271,
    availableInDays: 7, listedDaysAgo: 12, pets: 'cats_dogs', laundry: 'shared', parking: 'off_street',
    amenities: ['Balcony', 'Dishwasher', 'Pet wash station'],
    agent: 'tomas',
    description:
      'Two-bedroom with a balcony in a well-kept garden apartment complex. On-site laundry, assigned parking and a dog run. Bus 12 reaches the Canal District in ten minutes.',
  },

  // Canal District
  {
    neighborhood: 'canal-district', propertyType: 'apartment', address: '88 Towpath Lane', unit: '4B',
    rent: 2350, beds: 1, baths: 1, sqft: 680, lat: 47.60921, lng: -122.34955,
    availableInDays: 14, listedDaysAgo: 1, pets: 'cats_dogs', laundry: 'in_unit', parking: 'none',
    amenities: ['Balcony', 'Dishwasher', 'Rooftop deck', 'Bike storage'],
    agent: 'elena',
    description:
      'Canal-front one-bedroom with a Juliet balcony over the towpath. In-unit laundry, a dishwasher and a shared rooftop with string lights. Bars, bakeries and the Thursday night market are right outside.',
  },
  {
    neighborhood: 'canal-district', propertyType: 'apartment', address: '410 Lock Street', unit: '2C',
    rent: 1695, beds: 0, baths: 1, sqft: 450, lat: 47.61015, lng: -122.35983,
    availableInDays: 0, listedDaysAgo: 4, pets: 'cats', laundry: 'shared', parking: 'none',
    amenities: ['Hardwood floors', 'Bike storage'],
    agent: 'elena',
    description:
      'Compact studio in a 1912 brick building on Lock Street. Big double-hung windows, a galley kitchen and laundry in the basement. Perfect for someone who’d rather be out on the canal than at home.',
  },
  {
    neighborhood: 'canal-district', propertyType: 'condo', address: '2 Bridge Street', unit: '702',
    rent: 3300, deposit: 4950, beds: 2, baths: 2, sqft: 1050, lat: 47.61647, lng: -122.36418,
    availableInDays: 21, listedDaysAgo: 7, pets: 'cats_dogs', laundry: 'in_unit', parking: 'garage',
    amenities: ['River views', 'Balcony', 'Elevator', 'Fitness center', 'Doorman', 'Dishwasher'],
    agent: 'elena',
    description:
      'Seventh-floor condo where the canal meets the river, with a long balcony over both. Concierge desk, gym and secured parking. Split bedrooms, each with its own bath.',
  },
  {
    neighborhood: 'canal-district', propertyType: 'apartment', address: '155 Barge Avenue', unit: '3A',
    rent: 2650, beds: 2, baths: 1, sqft: 860, lat: 47.60453, lng: -122.36535,
    availableInDays: 5, listedDaysAgo: 16, pets: 'cats_dogs', laundry: 'shared', parking: 'street',
    amenities: ['Hardwood floors', 'Dishwasher', 'High ceilings'],
    agent: 'elena',
    description:
      'Classic railroad-style two-bedroom above a bookshop, with tall ceilings and refinished floors throughout. Lively block — the canal footbridge and the 24-hour diner are on the corner.',
  },
  {
    neighborhood: 'canal-district', propertyType: 'townhouse', address: '21 Lockkeeper Row',
    rent: 3400, beds: 3, baths: 2, sqft: 1350, lat: 47.60354, lng: -122.35409,
    availableInDays: 30, listedDaysAgo: 8, pets: 'cats_dogs', laundry: 'in_unit', parking: 'off_street',
    amenities: ['Private patio', 'Rooftop deck', 'Dishwasher', 'Storage unit'],
    agent: 'elena',
    description:
      'Narrow three-story rowhouse on a historic block of lockkeepers’ cottages. Roof deck with canal views, a cozy patio and a top-floor primary suite.',
  },
  {
    neighborhood: 'canal-district', propertyType: 'apartment', address: '600 Canal Street', unit: '9E',
    rent: 2250, beds: 1, baths: 1, sqft: 710, lat: 47.61313, lng: -122.34603,
    availableInDays: 10, listedDaysAgo: 2, pets: 'cats_dogs', laundry: 'in_unit', parking: 'garage',
    amenities: ['Elevator', 'Fitness center', 'Rooftop deck', 'Package lockers', 'EV charging'],
    agent: 'elena',
    description:
      'Ninth-floor one-bedroom in a newer building with wide views over the district’s rooftops. Garage parking with EV chargers, a rooftop lounge and a gym.',
  },

  // Northgate
  {
    neighborhood: 'northgate', propertyType: 'apartment', address: '1 Station Avenue', unit: '1204',
    rent: 3050, beds: 2, baths: 2, sqft: 1010, lat: 47.64295, lng: -122.36,
    availableInDays: 7, listedDaysAgo: 3, pets: 'cats_dogs', laundry: 'in_unit', parking: 'garage',
    amenities: ['Elevator', 'Fitness center', 'Co-working lounge', 'Rooftop deck', 'Package lockers', 'Central air'],
    agent: 'marcus',
    description:
      'Twelfth-floor corner unit in Northgate’s newest tower, directly above the light rail station. Floor-to-ceiling glass, central air and a full amenity floor with co-working space and a gym.',
  },
  {
    neighborhood: 'northgate', propertyType: 'apartment', address: '240 Transit Way', unit: '3K',
    rent: 1750, beds: 0, baths: 1, sqft: 500, lat: 47.64363, lng: -122.35293,
    availableInDays: -4, listedDaysAgo: 5, pets: 'cats_dogs', laundry: 'in_unit', parking: 'none',
    amenities: ['Elevator', 'Bike storage', 'Package lockers'],
    agent: 'marcus',
    description:
      'Efficient new-construction studio with in-unit laundry and a kitchen that actually fits a table. A two-minute walk to Northgate Station and twenty minutes to downtown.',
  },
  {
    neighborhood: 'northgate', propertyType: 'townhouse', address: '33 Signal Street',
    rent: 3500, beds: 3, baths: 2.5, sqft: 1620, lat: 47.63791, lng: -122.36836,
    availableInDays: 21, listedDaysAgo: 10, pets: 'cats_dogs', laundry: 'in_unit', parking: 'garage',
    amenities: ['Private patio', 'Central air', 'Dishwasher', 'EV charging'],
    agent: 'marcus',
    description:
      'Brand-new townhouse with an attached garage and EV charger, central air and a patio off the kitchen. Three bedrooms upstairs and an easy walk to the station and Northgate Commons.',
  },
  {
    neighborhood: 'northgate', propertyType: 'apartment', address: '512 Northgate Boulevard', unit: '2B',
    rent: 1950, beds: 1, baths: 1, sqft: 700, lat: 47.6508, lng: -122.33928,
    availableInDays: 3, listedDaysAgo: 13, pets: 'cats', laundry: 'shared', parking: 'off_street',
    amenities: ['Balcony', 'Dishwasher', 'Courtyard'],
    agent: 'marcus',
    description:
      'Garden-style one-bedroom with a balcony facing the courtyard garden. Updated kitchen, assigned parking and on-site laundry. A quick bus ride to the station.',
  },
  {
    neighborhood: 'northgate', propertyType: 'condo', address: '88 Commons Place', unit: '405',
    rent: 2950, beds: 2, baths: 2, sqft: 1080, lat: 47.64631, lng: -122.34604,
    availableInDays: 30, listedDaysAgo: 6, pets: 'cats_dogs', laundry: 'in_unit', parking: 'garage',
    amenities: ['Balcony', 'Elevator', 'Fitness center', 'Central air', 'Storage unit'],
    agent: 'marcus',
    description:
      'Owner-managed condo overlooking Northgate Commons, with a wide balcony and central air. Two bedrooms on opposite sides of the living room, a storage locker and one garage space.',
  },
];
