import { fetchAllRows } from "./fetchAllRows.js";

export async function addPollData(db, announcements, discordId = null, adminMode = false) {
  const ids = announcements.filter((item) => item.is_poll).map((item) => item.id);
  if (!ids.length) return announcements;
  const options = [], votes = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    const [optionResult, voteResult] = await Promise.all([
      fetchAllRows(db.from("salary_poll_options").select("id,announcement_id,label,sort_order").in("announcement_id", batch).order("sort_order").order("id")),
      fetchAllRows(db.from("salary_poll_votes").select("id,announcement_id,option_id,discord_id").in("announcement_id", batch).order("id")),
    ]);
    if (optionResult.error) throw optionResult.error;
    if (voteResult.error) throw voteResult.error;
    options.push(...optionResult.data);
    votes.push(...voteResult.data);
  }
  return announcements.map((item) => {
    if (!item.is_poll) return item;
    const ownVotes = votes.filter((vote) => vote.announcement_id === item.id);
    return { ...item,
      poll_options: options.filter((option) => option.announcement_id === item.id).map((option) => ({ ...option, vote_count: ownVotes.filter((vote) => vote.option_id === option.id).length })),
      my_poll_option_ids: discordId ? ownVotes.filter((vote) => vote.discord_id === discordId).map((vote) => vote.option_id) : [],
      poll_voter_count: new Set(ownVotes.map((vote) => vote.discord_id)).size,
      ...(adminMode ? { poll_votes: ownVotes } : {}),
    };
  });
}
