export const channelName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 30);
export const serverItemName = (value: string) => value.trim().slice(0, 30);
