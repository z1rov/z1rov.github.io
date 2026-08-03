// Author: z1rov

async function loadAboutPosts() {
  var container = document.getElementById('aboutPostsContainer');
  if (!container) return;

  var prefix = getRootPrefix();

  try {
    var res = await fetch(prefix + 'data/for-you.json?v=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);

    var posts = await res.json();
    var recent = Array.isArray(posts) ? posts.slice(0, 3) : [];

    if (!recent.length) {
      container.innerHTML = '<p class="am-posts-empty">No posts yet.</p>';
      return;
    }

    container.innerHTML = '';
    recent.forEach(function (post) {
      container.appendChild(renderAboutPost(post, prefix));
    });

  } catch (err) {
    console.error('[about.js]', err);
    container.innerHTML = '<p class="am-posts-empty">Could not load posts.</p>';
  }
}

function renderAboutPost(post, prefix) {
  var title = post.title || 'Untitled';
  var date = post.date || post.published || '';
  var category = post.category || (Array.isArray(post.tags) ? post.tags[0] : '') || '';
  var url = post.permalink || post.url || post.link || (post.slug ? prefix + 'post/' + post.slug + '.html' : '#');
  
  var a = document.createElement('a');
  a.className = 'am-post-item';
  a.href = url;

  var meta = document.createElement('div');
  meta.className = 'am-post-meta';

  if (category) {
    var tag = document.createElement('span');
    tag.className = 'am-post-tag';
    tag.textContent = category;
    meta.appendChild(tag);
  }

  if (date) {
    var dateEl = document.createElement('span');
    dateEl.className = 'am-post-date';
    dateEl.textContent = formatAboutDate(date);
    meta.appendChild(dateEl);
  }

  var titleEl = document.createElement('span');
  titleEl.className = 'am-post-title';
  titleEl.textContent = title;

  var arrow = document.createElement('span');
  arrow.className = 'am-post-arrow';
  arrow.textContent = '↗';

  a.appendChild(meta);
  a.appendChild(titleEl);
  a.appendChild(arrow);

  return a;
}

function formatAboutDate(value) {
  var d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadAboutPosts);
} else {
  loadAboutPosts();
}