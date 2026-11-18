# HALO launch drafts in Buffer

This operator command prepares one campaign draft per run. Preview is local. Creating a draft requires an explicit flag, a Buffer organization ID, and a channel ID. An operator can then review the draft, add any final assets, and schedule it in Buffer.

From the repository root, run these commands with Node 22 or later.

```sh
node scripts/halo-buffer.mjs list
node scripts/halo-buffer.mjs draft linkedin
node scripts/halo-buffer.mjs organizations
node scripts/halo-buffer.mjs channels --org YOUR_ORGANIZATION_ID
node scripts/halo-buffer.mjs draft linkedin --org YOUR_ORGANIZATION_ID --channel YOUR_CHANNEL_ID --create
```

The organization and channel commands and the creation flag need a Buffer API key in the local environment as BUFFER_API_KEY. Create it in [Buffer API settings](https://publish.buffer.com/settings/api). Load it through your local secret manager or an ignored environment file. Check that the selected channel is the intended HALO brand account.

For an image or video draft, add --media path/to/media.json. The JSON file can contain assets and the network-specific metadata described by Buffer. For example, an image asset looks like this.

```json
{"assets":[{"image":{"url":"https://example.com/halo-launch.jpg"}}]}
```

Use a publicly accessible HTTPS media file. The script prints the separate profile tracking link for Instagram, TikTok, and YouTube. Use that link in the profile or other supported link placement. Pinterest may require a board selection. Finish Reddit and Substack Notes in their composers.

If the request times out or the outcome is unclear, check the channel's Drafts before retrying to avoid a duplicate. Record creator, partner, and press follow-ups in Twenty.

[Buffer draft API](https://developers.buffer.com/examples/create-draft-post.html) · [Buffer media and scheduling guide](https://developers.buffer.com/guides/posts-and-scheduling.html)
