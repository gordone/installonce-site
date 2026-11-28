export function brandHaloShell(html) {
  const wordmark = '<i class="native-halo-wordmark" aria-hidden="true"></i>';
  const mobileBrand = `<b class="native-halo-mobile" role="img" aria-label="HALO">${wordmark}</b>`;
  return html
    .replace('>HALO<span>A little, every day.</span></button>',
      `>${wordmark}<span>1 identity &middot; 60 seconds &middot; 7 days</span></button>`)
    .replace('class="wordmark">MY HALO ',
      `class="wordmark">${mobileBrand}<b class="native-halo-product">MY HALO</b> `)
    .replace('<span class="halo-mark" aria-hidden="true"></span> HALO',
      '<i class="native-halo-wordmark" role="img" aria-label="HALO"></i>');
}
