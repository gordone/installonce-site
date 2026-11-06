import { supabase } from './halo-account';

const client = supabase;
if (client) {
  const group = document.querySelector<HTMLSelectElement>('[data-community-group]')!;
  const status = document.querySelector<HTMLElement>('[data-community-status]')!;
  const membership = document.querySelector<HTMLButtonElement>('[data-membership]')!;
  const area = document.querySelector<HTMLElement>('[data-member-area]')!;
  const compose = document.querySelector<HTMLFormElement>('[data-community-compose]')!;
  const feed = document.querySelector<HTMLElement>('[data-community-feed]')!;
  const more = document.querySelector<HTMLButtonElement>('[data-community-more]')!;
  const account = document.querySelector<HTMLDetailsElement>('[data-community-account]')!;
  const requested = new URLSearchParams(location.search).get('blueprint');
  if (Array.from(group.options).some((option) => option.value === requested)) group.value = requested!;
  let userId: string | null = null;
  let generation = 0;
  let joined = false;
  let page = 0;
  const pageSize = 20;

  type Post = { id: string; author_id: string; kind: string; title: string; body: string; created_at: string; hidden: boolean };

  function renderPost(post: Post, id: string, view: number) {
    const article = document.createElement('article');
    const meta = document.createElement('small');
    meta.textContent = post.kind + ' · ' + new Date(post.created_at).toLocaleDateString() +
      (post.hidden ? ' · Hidden by moderation' : '');
    const title = document.createElement('h3');
    title.textContent = post.title;
    const body = document.createElement('p');
    body.textContent = post.body;
    article.append(meta, title, body);
    const button = document.createElement('button');
    button.type = 'button';
    article.append(button);
    if (post.author_id === id) {
      button.textContent = 'Delete my post';
      button.addEventListener('click', async () => {
        if (!confirm('Delete this post from the group?')) return;
        button.disabled = true;
        const { error } = await client!.from('halo_community_posts').delete().eq('id', post.id);
        if (view !== generation) return;
        if (error) { status.textContent = 'Could not delete your post.'; button.disabled = false; }
        else { article.remove(); status.textContent = 'Your post was deleted.'; }
      });
    } else {
      const reason = document.createElement('select');
      reason.setAttribute('aria-label', 'Report reason for ' + post.title);
      for (const value of ['Private information', 'Harassment', 'Spam', 'Other']) reason.add(new Option(value));
      article.insertBefore(reason, button);
      button.textContent = 'Report';
      button.addEventListener('click', async () => {
        button.disabled = true;
        const { error } = await client!.from('halo_community_reports').insert({ post_id: post.id, reason: reason.value });
        if (view !== generation) return;
        status.textContent = !error ? 'Report recorded for review.'
          : error.code === '23505' ? 'You already reported this post.' : 'Could not record the report.';
        button.disabled = !error || error.code === '23505';
      });
    }
    feed.append(article);
  }

  async function loadPosts(view: number, id: string) {
    more.disabled = true;
    const { data, error } = await client!.from('halo_community_posts')
      .select('id, author_id, kind, title, body, created_at, hidden').eq('blueprint', group.value)
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (view !== generation) return;
    more.disabled = false;
    if (error) { status.textContent = 'Could not load group posts.'; more.hidden = false; return; }
    for (const post of data) renderPost(post, id, view);
    if (!page && !data.length) feed.textContent = 'No posts yet.';
    more.hidden = data.length < pageSize;
    page++;
  }

  async function refresh() {
    const view = ++generation;
    const id = userId;
    area.hidden = true;
    membership.hidden = true;
    feed.replaceChildren();
    joined = false;
    page = 0;
    if (!id) { status.textContent = 'Sign in to join a group.'; return; }
    status.textContent = 'Loading group…';
    const { data, error } = await client!.from('halo_community_members')
      .select('blueprint').eq('user_id', id).eq('blueprint', group.value).maybeSingle();
    if (view !== generation) return;
    if (error) { status.textContent = 'Could not load this group. Refresh to retry.'; return; }
    joined = Boolean(data);
    membership.disabled = false;
    membership.hidden = false;
    membership.textContent = joined ? 'Leave group' : 'Join group';
    area.hidden = !joined;
    status.textContent = joined ? 'You’re a member of this group.' : 'Join this group to read and contribute.';
    if (joined) await loadPosts(view, id);
  }

  client.auth.onAuthStateChange((_event, session) => {
    const id = session?.user.id ?? null;
    if (id === userId) return;
    userId = id;
    if (id) account.open = false;
    window.setTimeout(() => void refresh(), 0);
  });

  group.addEventListener('change', () => {
    const url = new URL(location.href);
    url.searchParams.set('blueprint', group.value);
    history.replaceState(null, '', url);
    compose.reset();
    void refresh();
  });

  membership.addEventListener('click', async () => {
    if (!userId) return;
    const view = generation;
    membership.disabled = true;
    const result = joined
      ? await client.from('halo_community_members').delete().eq('user_id', userId).eq('blueprint', group.value)
      : await client.from('halo_community_members').insert({ blueprint: group.value });
    if (view !== generation) return;
    if (result.error && result.error.code !== '23505') {
      status.textContent = 'Could not change your membership.';
      membership.disabled = false;
    } else void refresh();
  });

  compose.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!userId || !joined) return;
    const view = generation;
    const fields = new FormData(compose);
    const title = String(fields.get('title')).trim();
    const body = String(fields.get('body')).trim();
    if (!title || !body) { status.textContent = 'Enter a title and post text.'; return; }
    const submit = compose.querySelector<HTMLButtonElement>('button[type=submit]')!;
    submit.disabled = true;
    const { error } = await client.from('halo_community_posts').insert({
      blueprint: group.value, kind: fields.get('kind'), title, body,
    });
    submit.disabled = false;
    if (view !== generation) return;
    if (error) status.textContent = 'Could not publish your post. Try again.';
    else { compose.reset(); await refresh(); }
  });
  more.addEventListener('click', () => { if (userId && joined) void loadPosts(generation, userId); });
}
