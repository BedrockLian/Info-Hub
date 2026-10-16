import type { StoryFollowupsResponse } from "@aihot/contracts/site";
import { resolveStory, storyContent } from "./stories.ts";

/** A short reading-page list, using the same publication/filter rules as the full event. */
export async function loadStoryFollowups(storyPublicId: string): Promise<StoryFollowupsResponse | null> {
  let found=await resolveStory(storyPublicId);
  if(found.kind==='merged')found=await resolveStory(found.target);
  if(found.kind!=='found')return null;
  const content=await storyContent(found.storyId,new Date());
  if(!content)return null;
  return {items:content.developments.slice(0,8).map(({factId,representative:r})=>({factId,representative:{id:r.id,title:r.title,source:{name:r.source_name},timelineAt:r.at.toISOString()}})),more:content.developments.length>8};
}
