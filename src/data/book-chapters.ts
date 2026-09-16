export interface Chapter {
  number: number;
  slug: string;
  title: string;
  description: string;
  materials: { title: string; description: string; href: string; format: string }[];
}

// Add approved chapter titles and published materials here.
export const chapters: Chapter[] = [];
