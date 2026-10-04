/* Interactive components shared by all quiz steps. Measurements stay in kg/cm. */
window.QuizUI = (() => {
  const play = '<svg viewBox="0 0 448 512" aria-hidden="true"><path fill="currentColor" d="M424.4 214.7L72.4 6.6C43.8-10.3 0 6.1 0 47.9V464c0 37.5 40.7 60.1 72.4 41.3l352-208c31.4-18.5 31.5-64.1 0-82.6z"/></svg>';
  const pause = '<svg viewBox="0 0 448 512" aria-hidden="true"><path fill="currentColor" d="M48 0h80c26.5 0 48 21.5 48 48v416c0 26.5-21.5 48-48 48H48c-26.5 0-48-21.5-48-48V48C0 21.5 21.5 0 48 0zm272 0h80c26.5 0 48 21.5 48 48v416c0 26.5-21.5 48-48 48h-80c-26.5 0-48-21.5-48-48V48c0-26.5 21.5-48 48-48z"/></svg>';
  const microphone = '<svg class="audio-microphone" viewBox="0 0 19 26" aria-hidden="true"><path fill="white" d="M9.217,24.401c-1.158,0-2.1-0.941-2.1-2.1v-2.366c-2.646-0.848-4.652-3.146-5.061-5.958L2.004,13.62l-0.003-0.081c-0.021-0.559,0.182-1.088,0.571-1.492c0.39-0.404,0.939-0.637,1.507-0.637h0.3c0.254,0,0.498,0.044,0.724,0.125v-6.27C5.103,2.913,7.016,1,9.367,1c2.352,0,4.265,1.913,4.265,4.265v6.271c0.226-0.081,0.469-0.125,0.723-0.125h0.3c0.564,0,1.112,0.233,1.501,0.64s0.597,0.963,0.571,1.526c0,0.005,0.001,0.124-0.08,0.6c-0.47,2.703-2.459,4.917-5.029,5.748v2.378c0,1.158-0.942,2.1-2.1,2.1H9.217z"/><path fill="currentColor" d="M9.367,15.668c1.527,0,2.765-1.238,2.765-2.765V5.265c0-1.527-1.238-2.765-2.765-2.765S6.603,3.738,6.603,5.265v7.638C6.603,14.43,7.84,15.668,9.367,15.668z M14.655,12.91h-0.3c-0.33,0-0.614,0.269-0.631,0.598c0,0,0,0-0.059,0.285c-0.41,1.997-2.182,3.505-4.298,3.505c-2.126,0-3.904-1.521-4.304-3.531C5.008,13.49,5.008,13.49,5.008,13.49c-0.016-0.319-0.299-0.579-0.629-0.579h-0.3c-0.33,0-0.591,0.258-0.579,0.573c0,0,0,0,0.04,0.278c0.378,2.599,2.464,4.643,5.076,4.978v3.562c0,0.33,0.27,0.6,0.6,0.6h0.3c0.33,0,0.6-0.27,0.6-0.6V18.73c2.557-0.33,4.613-2.286,5.051-4.809c0.057-0.328,0.061-0.411,0.061-0.411C15.243,13.18,14.985,12.91,14.655,12.91z"/></svg>';
  const pointer = '<svg class="ruler-pointer" viewBox="0 0 28 100" aria-hidden="true"><path fill="currentColor" d="M16 2C16 .89543 15.1046 0 14 0C12.8954 0 12 .895431 12 2L12 85.4286L0 100H28L16 85.4286L16 2Z"/></svg>';
  const waveHeights = [3.49,10.34,19.68,17.14,27.02,23.02,21.92,25.18,16.74,15.31,7.39,9.21,18.37,16.98,18.25,22.87,29.05,20.67,22.07,14.82,13.54,1,7.13,13.13,22.38,24.93,24.31,22.97,24,14.84,10.38,7.44,4,17.49,16.99,23.43,22.19,23.97,20.1,19.04,13.64,15.13,7.59,16.52,16.25,16.2,25.52,27.74,22.64,17.47];
  const units = {};
  let disposers = [];
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const time = n => `${String(Math.floor((n || 0) / 60)).padStart(2,'0')}:${String(Math.floor((n || 0) % 60)).padStart(2,'0')}`;
  const feet = cm => { const inches = Math.round(cm / 2.54); return `${Math.floor(inches / 12)}'${inches % 12}"`; };
  function measureText(value, unit) {
    if (unit === 'pol') return feet(value);
    return `${Math.round(unit === 'lb' ? value / 0.45359237 : value)}<small>${unit}</small>`;
  }
  function measure(layer, unit, min, max, answers) {
    const key = layer.content.name;
    const activeUnit = units[key] || unit;
    const value = clamp(Number(answers[key] ?? layer.content.value), min, max);
    const label = key === 'ideal' ? 'Peso desejado' : unit === 'kg' ? 'Peso atual' : 'Altura';
    const ticks = Array.from({length:max-min+1},(_,i) => {
      const n = min+i;
      return `<div class="ruler-tick ${n%10===0?'major':n%5===0?'medium':''}"><i></i>${n%10===0?`<span data-tick-value="${n}"></span>`:''}</div>`;
    }).join('');
    return `<div class="measure-component" data-measure-component="${key}" data-base-unit="${unit}"><div class="unit-toggle" role="group" aria-label="Unidade de ${label.toLowerCase()}">${[unit,unit==='kg'?'lb':'pol'].map(u=>`<button type="button" data-measure-unit="${u}" class="${activeUnit===u?'active':''}" aria-pressed="${activeUnit===u}">${u}</button>`).join('')}</div><div class="ruler"><div class="ruler-stage"><div class="ruler-value" data-value-for="${key}">${measureText(value,activeUnit)}</div><div class="ruler-track">${ticks}</div>${pointer}<input type="range" min="${min}" max="${max}" step="1" value="${value}" data-measure="${key}" aria-label="${label}"></div><div class="ruler-help">Arraste para ajustar</div></div></div>`;
  }
  function audio(layer) {
    const c=layer.content, id=`audio-${layer.id}`;
    const wave=waveHeights.map(h=>`<i style="height:${h}px"></i>`).join('');
    return `<div class="audio-card" data-audio-card="${id}"><div class="audio-pattern"></div><div class="audio-bubble"><span class="audio-tail"><svg viewBox="0 0 8 13" aria-hidden="true"><path fill="currentColor" d="M1.533,2.568L8,11.193V0L2.812,0C1.042,0,.474,1.156,1.533,2.568z"/></svg></span><div class="audio-sender">${c.sender||'Fabiana Santos'}</div><div class="audio-controls"><button type="button" class="audio-play" data-audio="${id}" aria-label="Reproduzir áudio" aria-pressed="false">${play}</button><div class="audio-wave-zone"><div class="audio-wave">${wave}</div><div class="audio-wave audio-wave-played">${wave}</div><span class="audio-cursor"></span><input type="range" min="0" max="100" step="0.01" value="0" data-audio-range="${id}" aria-label="Progresso do áudio"><span class="audio-time" data-audio-time="${id}">00:00</span></div><div class="audio-avatar-wrap"><img class="audio-avatar" src="${c.image?.src||''}" alt="${c.sender||'Áudio'}"><button type="button" class="audio-mic-button" data-audio="${id}" aria-label="Reproduzir áudio de ${c.sender||'Fabiana Santos'}">${microphone}</button></div></div></div><audio id="${id}" preload="metadata" src="${c.audio?.src||''}"></audio><span class="audio-error" role="status" hidden></span></div>`;
  }
  function bindMeasures(root, answers) {
    root.querySelectorAll('[data-measure-component]').forEach(component=>{
      const input=component.querySelector('[data-measure]'), stage=component.querySelector('.ruler-stage'),track=component.querySelector('.ruler-track'), key=input.dataset.measure;
      const min=Number(input.min),max=Number(input.max),base=component.dataset.baseUnit;
      let current=Number(input.value),drag=null,animation=0;
      const spacing=()=>stage.clientWidth/30;
      function paint(value) {
        current=clamp(value,min,max);
        const rounded=Math.round(current),unit=units[key]||base;
        answers[key]=rounded; input.value=rounded;
        component.querySelector('.ruler-value').innerHTML=measureText(rounded,unit);
        input.setAttribute('aria-valuetext',unit==='pol'?feet(rounded):`${Math.round(unit==='lb'?rounded/0.45359237:rounded)} ${unit}`);
        track.style.setProperty('--tick-spacing',`${spacing()}px`);
        track.style.transform=`translate3d(${-(current-min+.5)*spacing()}px,0,0)`;
      }
      function labels() {
        const unit=units[key]||base;
        component.querySelectorAll('[data-measure-unit]').forEach(b=>{const active=b.dataset.measureUnit===unit;b.classList.toggle('active',active);b.setAttribute('aria-pressed',active)});
        component.querySelectorAll('[data-tick-value]').forEach(s=>{const n=Number(s.dataset.tickValue);s.textContent=unit==='pol'?feet(n):String(Math.round(unit==='lb'?n/0.45359237:n))});
        paint(current);
      }
      function settle(target) {
        cancelAnimationFrame(animation);
        const from=current,to=Math.round(clamp(target,min,max)),start=performance.now();
        function frame(now){const p=Math.min(1,(now-start)/350);paint(from+(to-from)*(1-Math.pow(1-p,3)));if(p<1)animation=requestAnimationFrame(frame);else animation=0}
        animation=requestAnimationFrame(frame);
      }
      input.addEventListener('input',()=>{cancelAnimationFrame(animation);paint(Number(input.value))});
      input.addEventListener('keydown',e=>{
        const changes={ArrowLeft:-1,ArrowDown:-1,ArrowRight:1,ArrowUp:1,PageDown:-10,PageUp:10};
        if(e.key in changes||e.key==='Home'||e.key==='End'){e.preventDefault();settle(e.key==='Home'?min:e.key==='End'?max:Math.round(current)+(changes[e.key]||0))}
      });
      input.addEventListener('pointerdown',e=>{
        if(e.button!==0)return; cancelAnimationFrame(animation);e.preventDefault();
        drag={x:e.clientX,origin:current,lastX:e.clientX,lastTime:performance.now(),velocity:0};
        input.setPointerCapture(e.pointerId);stage.classList.add('dragging');
      });
      input.addEventListener('pointermove',e=>{
        if(!drag)return;const now=performance.now(),dt=now-drag.lastTime;
        if(dt>0)drag.velocity=.6*drag.velocity+.4*(drag.lastX-e.clientX)/dt;
        paint(drag.origin+(drag.x-e.clientX)/spacing());drag.lastX=e.clientX;drag.lastTime=now;
      });
      function finish(e){if(!drag)return;const velocity=performance.now()-drag.lastTime<100?drag.velocity:0;const target=current+(e.type==='pointercancel'?0:clamp(velocity*120/spacing(),-15,15));drag=null;stage.classList.remove('dragging');if(input.hasPointerCapture(e.pointerId))input.releasePointerCapture(e.pointerId);settle(target)}
      input.addEventListener('pointerup',finish);input.addEventListener('pointercancel',finish);
      component.querySelectorAll('[data-measure-unit]').forEach(b=>b.addEventListener('click',()=>{units[key]=b.dataset.measureUnit;labels()}));
      const observer=new ResizeObserver(()=>paint(current));observer.observe(stage);
      disposers.push(()=>{observer.disconnect();cancelAnimationFrame(animation)});labels();
    });
  }
  function bindAudio(root) {
    root.querySelectorAll('[data-audio-card]').forEach(card=>{
      const audio=card.querySelector('audio'),buttons=card.querySelectorAll('[data-audio]'),range=card.querySelector('[data-audio-range]'),timeLabel=card.querySelector('.audio-time'),zone=card.querySelector('.audio-wave-zone'),error=card.querySelector('.audio-error');
      let animation=0,started=false;
      const duration=()=>Number.isFinite(audio.duration)?audio.duration:0;
      function paint(){const progress=duration()?audio.currentTime/duration()*100:0;zone.style.setProperty('--audio-progress',`${progress}%`);range.value=progress;range.setAttribute('aria-valuetext',`${time(audio.currentTime)} de ${time(duration())}`);timeLabel.textContent=time(started?audio.currentTime:duration())}
      function status(){const playing=!audio.paused&&!audio.ended;card.classList.toggle('playing',playing);buttons.forEach((b,i)=>{b.setAttribute('aria-pressed',playing);b.setAttribute('aria-label',`${playing?'Pausar':'Reproduzir'} áudio${i?' de Fabiana Santos':''}`);if(b.classList.contains('audio-play'))b.innerHTML=playing?pause:play});cancelAnimationFrame(animation);if(playing){const frame=()=>{paint();if(!audio.paused)animation=requestAnimationFrame(frame)};animation=requestAnimationFrame(frame)}paint()}
      buttons.forEach(b=>b.addEventListener('click',async()=>{
        if(!audio.paused){audio.pause();return}
        root.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause()});error.hidden=true;
        try{await audio.play();started=true;status()}catch{error.textContent='Não foi possível reproduzir. Toque para tentar novamente.';error.hidden=false;status()}
      }));
      range.addEventListener('input',()=>{if(duration()){started=true;audio.currentTime=duration()*Number(range.value)/100;paint()}});
      audio.addEventListener('loadedmetadata',paint);audio.addEventListener('durationchange',paint);audio.addEventListener('timeupdate',paint);audio.addEventListener('play',()=>{started=true;status()});audio.addEventListener('pause',status);audio.addEventListener('ended',status);
      disposers.push(()=>{cancelAnimationFrame(animation);audio.pause()});paint();
    });
  }
  function bind(root,answers){bindMeasures(root,answers);bindAudio(root);root.querySelectorAll('[data-metric-target]').forEach(card=>{card.getBoundingClientRect();let secondFrame;const frame=requestAnimationFrame(()=>{secondFrame=requestAnimationFrame(()=>{card.style.setProperty('--metric-position',`${card.dataset.metricTarget}%`);card.classList.add('metric-ready')})});disposers.push(()=>{cancelAnimationFrame(frame);if(secondFrame)cancelAnimationFrame(secondFrame)})})}
  function dispose(){const previous=disposers;disposers=[];previous.forEach(fn=>fn())}
  return {measure,audio,bind,dispose};
})();
