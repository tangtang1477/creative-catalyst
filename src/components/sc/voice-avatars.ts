import alice from "@/assets/voices/alice.jpg";
import brian from "@/assets/voices/brian.jpg";
import callum from "@/assets/voices/callum.jpg";
import charlie from "@/assets/voices/charlie.jpg";
import george from "@/assets/voices/george.jpg";
import jessica from "@/assets/voices/jessica.jpg";
import laura from "@/assets/voices/laura.jpg";
import liam from "@/assets/voices/liam.jpg";
import lily from "@/assets/voices/lily.jpg";
import matilda from "@/assets/voices/matilda.jpg";
import river from "@/assets/voices/river.jpg";
import sarah from "@/assets/voices/sarah.jpg";

export const VOICE_AVATARS: Record<string, string> = {
  alice,
  brian,
  callum,
  charlie,
  george,
  jessica,
  laura,
  liam,
  lily,
  matilda,
  river,
  sarah,
};

export function voiceAvatarFor(name: string): string | undefined {
  return VOICE_AVATARS[name.trim().toLowerCase()];
}
