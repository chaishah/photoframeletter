import type { Settings } from "./types";

export interface Occasion {
  id: string;
  name: string;
  description: string;
  title: string;
  palette: Settings["palette"];
}

export const OCCASIONS: Occasion[] = [
  { id: "wedding", name: "Wedding", description: "The sky beneath your vows.", title: "THE NIGHT WE SAID I DO", palette: ["#182B30", "#FFFFFF", "#A7C4BE", "#EBD7AC"] },
  { id: "anniversary", name: "Anniversary", description: "Another year of your story.", title: "ALWAYS YOU", palette: ["#302039", "#FFF4E6", "#C5A2C8", "#E9C285"] },
  { id: "engagement", name: "Engagement", description: "Remember the moment you said yes.", title: "OUR FOREVER BEGINS", palette: ["#203448", "#FFFFFF", "#A8CADD", "#F0D4AA"] },
  { id: "first_date", name: "First date", description: "Where your story began.", title: "WHEN WE FIRST MET", palette: ["#39273C", "#FFF2F4", "#C19CAF", "#F1C0B8"] },
  { id: "valentines", name: "Valentine's Day", description: "A little sky for someone you love.", title: "YOU ARE MY STAR", palette: ["#421F32", "#FFF5E9", "#CE879F", "#F4BDCA"] },
  { id: "birthday", name: "Birthday", description: "Celebrate another trip around the Sun.", title: "BORN TO SHINE", palette: ["#222D50", "#FFF6DA", "#A2C8E9", "#F5D581"] },
  { id: "new_baby", name: "New baby", description: "The night a new little star arrived.", title: "HELLO LITTLE STAR", palette: ["#283A4C", "#FFFAEB", "#AACCD3", "#F2D4B8"] },
  { id: "graduation", name: "Graduation", description: "Honour a milestone and the road ahead.", title: "YOUR NEXT CHAPTER", palette: ["#172B40", "#FFFFFF", "#90AFC9", "#E8C56D"] },
  { id: "new_home", name: "New home", description: "Put your new place beneath the stars.", title: "HOME UNDER THE STARS", palette: ["#24372E", "#FCF8E8", "#A3BDA2", "#E6CBA1"] },
  { id: "friendship", name: "Friendship", description: "Celebrate the friend who is always there.", title: "UNDER THE SAME SKY", palette: ["#173C46", "#F6FBFF", "#8DC8CB", "#F1D59D"] },
  { id: "remembrance", name: "Remembrance", description: "A quiet keepsake for someone remembered.", title: "FOREVER IN OUR HEARTS", palette: ["#282D3B", "#F2F3F7", "#A2AFC4", "#D7CDBA"] },
  { id: "new_year", name: "New Year", description: "Mark a fresh beginning under the night sky.", title: "A NEW BEGINNING", palette: ["#182536", "#FFFFFF", "#9EBDD0", "#E7C47E"] },
];

export function applyOccasion(settings: Settings, occasion: Occasion): Settings {
  return { ...settings, title: occasion.title, palette: [...occasion.palette] };
}
