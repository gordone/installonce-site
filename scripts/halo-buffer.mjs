import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const createDraft = `
  mutation CreateHaloDraft($input: CreatePostInput!) {
    createPost(input: $input) {
      ... on PostActionSuccess { post { id status } }
      ... on MutationError { message }
    }
  }
`;

async function buffer(query, variables = {}) {
  const key = process.env.BUFFER_API_KEY?.trim();
  if (!key) throw new Error('Set BUFFER_API_KEY in your local environment.');
  const response = await fetch('https://api.buffer.com', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Buffer returned HTTP ${response.status}.`);
  const result = await response.json();
  if (result.errors?.length) throw new Error(result.errors.map(({ message }) => message).join('; '));
  return result.data;
}

async function main() {
  const { positionals: [command, id], values } = parseArgs({
    allowPositionals: true,
    options: {
      org: { type: 'string' },
      channel: { type: 'string' },
      media: { type: 'string' },
      create: { type: 'boolean' },
    },
  });

  if (command === 'organizations') {
    const data = await buffer('query { account { organizations { id } } }');
    console.table(data.account.organizations);
    return;
  }

  if (command === 'channels') {
    if (!values.org) throw new Error('Provide --org with the HALO Buffer organization ID.');
    const data = await buffer(
      'query Channels($input: ChannelsInput!) { channels(input: $input) { id name service } }',
      { input: { organizationId: values.org } },
    );
    console.table(data.channels);
    return;
  }

  if (!['draft', 'list'].includes(command)) {
    throw new Error('Choose organizations, channels, list, or draft.');
  }
  const posts = JSON.parse((await readFile(new URL('./halo-launch-posts.json', import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));
  if (command === 'list') {
    console.table(posts.map(({ id, channel, native }) => ({ id, channel, workflow: native ? 'Native' : 'Buffer' })));
    return;
  }

  const post = posts.find((entry) => entry.id === id);
  if (!post) throw new Error('Choose a campaign post ID from the list command.');
  const media = values.media ? JSON.parse(await readFile(values.media, 'utf8')) : {};
  const profileLink = ['instagram', 'tiktok', 'youtube'].includes(post.id);
  const input = {
    channelId: values.channel,
    text: profileLink || post.id === 'reddit' ? post.text : `${post.text}\n\n${post.link}`,
    assets: media.assets ?? [],
    metadata: media.metadata,
    schedulingType: 'automatic',
    mode: 'addToQueue',
    needsApproval: false,
    saveToDraft: true,
    aiAssisted: true,
  };

  if (!values.create) {
    console.log(JSON.stringify({ channel: post.channel, profileLink: profileLink ? post.link : undefined, input }, null, 2));
    return;
  }
  if (post.native) throw new Error(`Create this ${post.channel} draft in the platform composer.`);
  if (!values.channel || !values.org) throw new Error('Provide both --org and --channel to create a draft.');
  if (['instagram', 'tiktok', 'youtube', 'pinterest'].includes(post.id) && input.assets.length === 0) {
    throw new Error('Supply an image or video using --media for this channel.');
  }

  const { channels } = await buffer(
    'query Channels($input: ChannelsInput!) { channels(input: $input) { id name service } }',
    { input: { organizationId: values.org } },
  );
  const channel = channels.find((entry) => entry.id === values.channel);
  const service = ({ x: 'twitter', google_business_profile: 'googlebusiness' })[post.id] ?? post.id;
  if (!channel || ![post.id, service].includes(channel.service.toLowerCase())) {
    throw new Error('The selected Buffer channel does not match the campaign post and organization.');
  }

  const { createPost } = await buffer(createDraft, { input });
  if (createPost?.post?.status !== 'draft') {
    throw new Error(createPost?.message ?? 'Buffer did not confirm a draft. Check Buffer before retrying.');
  }
  console.log(`Created draft ${createPost.post.id} for ${channel.name}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
