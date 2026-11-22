const events = new Set(['halo_preview_active','halo_preview_feature_used','halo_preview_price_feedback']);
const features = new Set(['home','create','today','review','halos','plus','account','library','repeat',
  'initial_generation','activation','day_report','evidence','milestone_check','weekly_repeat','identity_edit','saved_change']);
const choices = new Set(['monthly','annual','prefer_free','not_yet']);
export function previewProperties(detail) {
  if (!detail || !events.has(detail.event) || !['free','plus_preview'].includes(detail.tier)) return null;
  const properties = {halo_schema:2,surface:'my_halo_preview',tier:detail.tier,$process_person_profile:false,$geoip_disable:true};
  if (detail.event==='halo_preview_price_feedback') {
    if (!choices.has(detail.choice)) return null;
    properties.choice=detail.choice;
  } else {
    if (!features.has(detail.feature)) return null;
    properties.feature=detail.feature;
  }
  return properties;
}
export function createPreviewCapture({storage,navigator,token,fetcher,randomId}) {
  return (detail) => {
    const properties=previewProperties(detail);
    if (!properties || !/^phc_[A-Za-z0-9_-]+$/.test(token || '')) return false;
    try {
      if (storage.getItem('halo.analytics.opt-in')!=='yes' || navigator.doNotTrack==='1' || navigator.globalPrivacyControl) return false;
      let visitor=storage.getItem('halo.analytics.visitor');
      if (!/^[0-9a-f-]{36}$/i.test(visitor || '')) visitor=randomId();
      storage.setItem('halo.analytics.visitor',visitor);
      properties.distinct_id=visitor;
      void fetcher('https://us.i.posthog.com/i/v0/e/',{method:'POST',credentials:'omit',referrerPolicy:'no-referrer',keepalive:true,
        headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:token,event:detail.event,properties})}).catch(()=>{});
      return true;
    } catch { return false; }
  };
}
if (typeof window!=='undefined') {
  const token=import.meta.env.PUBLIC_POSTHOG_PROJECT_TOKEN || (location.hostname==='thehalomethod.co' ? 'phc_r9Xejk8jjxQfk6UVmUz45wMQjdBPmNMcwk3qVk8TZDYQ' : '');
  try {
    const capture=createPreviewCapture({storage:localStorage,navigator,token,fetcher:fetch,randomId:()=>crypto.randomUUID()});
    window.addEventListener('halo:preview-metric',(event)=>capture(event.detail));
  } catch { /* Tracking cannot interrupt private HALO. */ }
}
