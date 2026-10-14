/*
   Liquid Glass - Dynamic SVG displacement map backdrop filter
*/
let uid = 0;
const SVGNS = 'http://www.w3.org/2000/svg';
const global = { strength: 3, blur: 3, sat: 160 };
const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);
const smoothStep = (a: number, b: number, t: number) => {
    t = clamp((t - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
};
const roundedRectSDF = (
    x: number,
    y: number,
    hw: number,
    hh: number,
    r: number,
) => {
    const qx = Math.abs(x) - hw + r;
    const qy = Math.abs(y) - hh + r;
    return (
        Math.min(Math.max(qx, qy), 0) +
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) -
        r
    );
};

// Glass filters are attached to a dedicated <defs> container managed by this module.
// The container is created once and stays connected in the document.
let ownDefs: SVGDefsElement | null = null;
const getDefs = () => {
    if (ownDefs && ownDefs.isConnected) return ownDefs;
    if (typeof document === 'undefined') return null;
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    const defs = document.createElementNS(SVGNS, 'defs');
    svg.append(defs);
    document.documentElement.append(svg);
    ownDefs = defs;
    return defs;
};

export type Glass = {
    el: HTMLElement;
    filter: SVGFilterElement;
    feImage: SVGFEImageElement;
    feDisp: SVGFEDisplacementMapElement;
    observer: ResizeObserver;
    id: string;
    bezelFrac: number;
    strength: number;
    zoom: number;
    update(): void;
    cleanup(): void;
};

// Deduplicate glass creation per element via WeakMap to prevent duplicate mounts and observer leaks.
const glasses = new WeakMap<HTMLElement, Glass>();

const buildDisplacementMap = (
    w: number,
    h: number,
    radius: number,
    bezel: number,
    strength: number,
    zoom: number,
) => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const img = ctx.createImageData(w, h);
    const raw = new Float32Array(w * h * 2);
    let maxD = 0.0001;
    const hw = w / 2;
    const hh = h / 2;
    const k = strength * global.strength;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const cx = x + 0.5 - hw;
            const cy = y + 0.5 - hh;
            const d = roundedRectSDF(cx, cy, hw, hh, radius);
            let m = smoothStep(-bezel, 0, d);
            m = m * m;
            const len = Math.hypot(cx, cy) || 1;
            const dx = -(cx / len) * m * k * bezel - cx * zoom;
            const dy = -(cy / len) * m * k * bezel - cy * zoom;
            const i = (y * w + x) * 2;
            raw[i] = dx;
            raw[i + 1] = dy;
            maxD = Math.max(maxD, Math.abs(dx), Math.abs(dy));
        }
    }
    const scale = maxD * 2;
    const data = img.data;
    for (let i = 0, p = 0; i < raw.length; i += 2, p += 4) {
        data[p] = clamp(raw[i] / scale + 0.5, 0, 1) * 255;
        data[p + 1] = clamp(raw[i + 1] / scale + 0.5, 0, 1) * 255;
        data[p + 2] = 128;
        data[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return { url: canvas.toDataURL(), scale };
};

// Attach liquid glass filter to an element (idempotent): single instance per element.
export const makeGlass = (el: HTMLElement): Glass | null => {
    if (typeof document === 'undefined') return null;
    const existing = glasses.get(el);
    if (existing) return existing;
    const defs = getDefs();
    if (!defs) return null;

    const id = 'lg-' + uid++;
    const filter = document.createElementNS(SVGNS, 'filter');
    filter.setAttribute('id', id);
    filter.setAttribute('filterUnits', 'userSpaceOnUse');
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    const feImage = document.createElementNS(SVGNS, 'feImage');
    feImage.setAttribute('result', 'map');
    feImage.setAttribute('preserveAspectRatio', 'none');
    const feDisp = document.createElementNS(SVGNS, 'feDisplacementMap');
    feDisp.setAttribute('in', 'SourceGraphic');
    feDisp.setAttribute('in2', 'map');
    feDisp.setAttribute('xChannelSelector', 'R');
    feDisp.setAttribute('yChannelSelector', 'G');
    filter.append(feImage, feDisp);
    defs.appendChild(filter);

    let observer: ResizeObserver;
    const g: Glass = {
        el,
        filter,
        feImage,
        feDisp,
        observer: null as unknown as ResizeObserver,
        id,
        bezelFrac: parseFloat(el.dataset.bezel || '0.5'),
        strength: parseFloat(el.dataset.strength || '0.5'),
        zoom: parseFloat(el.dataset.zoom || '0'),
        update() {
            const w = Math.round(el.offsetWidth);
            const h = Math.round(el.offsetHeight);
            if (!w || !h) return;
            const cs = getComputedStyle(el);
            let radius = parseFloat(cs.borderRadius) || 0;
            radius = Math.min(radius, w / 2, h / 2);
            const bezel = (Math.min(w, h) / 2) * this.bezelFrac;
            const disp = buildDisplacementMap(
                w,
                h,
                radius,
                bezel,
                this.strength,
                this.zoom * global.strength,
            );
            if (!disp) return;
            filter.setAttribute('width', String(w));
            filter.setAttribute('height', String(h));
            feImage.setAttribute('width', String(w));
            feImage.setAttribute('height', String(h));
            filter.setAttribute('x', '0');
            filter.setAttribute('y', '0');
            feImage.setAttribute('href', disp.url);
            feDisp.setAttribute('scale', disp.scale.toFixed(2));
            const backdrop = `url(#${id}) blur(${global.blur}px) saturate(${global.sat}%)`;
            el.style.backdropFilter = backdrop;
            el.style.setProperty('-webkit-backdrop-filter', backdrop);
        },
        cleanup() {
            observer.disconnect();
            filter.remove();
            el.style.backdropFilter = '';
            el.style.removeProperty('-webkit-backdrop-filter');
        },
    };

    observer = new ResizeObserver(() => g.update());
    g.observer = observer;
    observer.observe(el);
    glasses.set(el, g);
    g.update();
    return g;
};

export const removeGlass = (el: HTMLElement) => {
    const g = glasses.get(el);
    if (g) {
        g.cleanup();
        glasses.delete(el);
    } else {
        el.style.backdropFilter = '';
        el.style.removeProperty('-webkit-backdrop-filter');
    }
};

export const clearAllGlass = (selector = '[data-glass]') => {
    if (typeof document === 'undefined') return;
    document.querySelectorAll<HTMLElement>(selector).forEach(removeGlass);
};
