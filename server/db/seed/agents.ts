import type { Agent } from '@hearth/shared';

export const AGENTS = {
  maya: { name: 'Maya Okafor', company: 'Harbor & Hearth Realty', phone: '(360) 555-0142' },
  daniel: { name: 'Daniel Reyes', company: 'Millrace Property Co.', phone: '(360) 555-0178' },
  priya: { name: 'Priya Natarajan', company: 'Larch Hill Living', phone: '(360) 555-0119' },
  sam: { name: 'Sam Whitfield', company: 'Tidewater Realty', phone: '(360) 555-0163' },
  elena: { name: 'Elena Kowalski', company: 'Towpath Homes', phone: '(360) 555-0187' },
  marcus: { name: 'Marcus Chen', company: 'Northgate Residential', phone: '(360) 555-0124' },
  grace: { name: 'Grace O’Neill', company: 'Kestrel Realty Group', phone: '(360) 555-0151' },
  tomas: { name: 'Tomás Alvarez', company: 'Saltmarsh Realty', phone: '(360) 555-0196' },
} satisfies Record<string, Agent>;

export type AgentKey = keyof typeof AGENTS;
