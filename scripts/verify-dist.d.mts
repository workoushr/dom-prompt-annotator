export interface NoncharacterError {
  file: string;
  offset: number;
  noncharacter: string;
}

export function checkDistNoncharacters(dir?: string): NoncharacterError[];
export function sanitizeDistNoncharacters(dir?: string): number;
