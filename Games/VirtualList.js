// Lightweight virtualized list for fixed-height items.
//
// API:
//   const vl = new VirtualList(scrollContainer, {
//     data: [...],
//     itemHeight: 50,                          // fixed row height in px
//     renderItem: (value, index) => Element,   // build the row's DOM
//     onAfterRender: () => {},                 // optional, fires after each render pass
//     overscan: 4,                             // optional, extra rows above/below
//   });
//   vl.setData(newArray);                      // replace the data
//   vl.scrollToIndex(idx, "center" | "top");   // scroll the list so idx is visible
//   vl.destroy();                              // tear down listeners
//
// Container requirements:
//   The scrollContainer must have a defined height + overflow-y: auto.
//   VirtualList renders a single inner spacer that owns the full scroll
//   height; pool elements are absolutely positioned inside that spacer.
//
// Resize handling:
//   A ResizeObserver on the container re-runs render() on every viewport
//   change (window resize, devtools, fullscreen, mobile rotate, etc.).
class VirtualList {
  constructor(container, opts) {
    this.container = container;
    this.itemHeight = opts.itemHeight || 50;
    this.renderItem = opts.renderItem;
    this.onAfterRender = opts.onAfterRender || null;
    this.overscan = opts.overscan != null ? opts.overscan : 4;
    this.data = opts.data || [];

    // Spacer holds the full scrollable height; rows position absolutely inside it.
    // The inline `height` is intentional — it's how the scroll container knows
    // how far it needs to scroll. Width follows the parent's content box.
    this.spacer = document.createElement("div");
    this.spacer.style.position = "relative";
    this.container.appendChild(this.spacer);

    this.pool = []; // [{ wrapper, idx }]

    this._scheduled = false;
    this._scheduleRender = () => {
      if (this._scheduled) return;
      this._scheduled = true;
      requestAnimationFrame(() => {
        this._scheduled = false;
        this._render();
      });
    };

    this.container.addEventListener("scroll", this._scheduleRender, {
      passive: true,
    });

    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(this._scheduleRender);
      this._ro.observe(this.container);
    } else {
      window.addEventListener("resize", this._scheduleRender);
    }

    this._updateSpacer();
    this._render();
  }

  setData(newData) {
    this.data = newData || [];
    // Invalidate every slot so visible rows repaint with new content.
    for (const item of this.pool) item.idx = -1;
    this._updateSpacer();
    this.container.scrollTop = 0;
    this._render();
  }

  scrollToIndex(idx, alignment) {
    const top = idx * this.itemHeight;
    if (alignment === "center") {
      const viewH = this.container.clientHeight;
      this.container.scrollTop = top - viewH / 2 + this.itemHeight / 2;
    } else {
      this.container.scrollTop = top;
    }
  }

  destroy() {
    if (this._ro) this._ro.disconnect();
    this.container.removeEventListener("scroll", this._scheduleRender);
    if (this.spacer && this.spacer.parentNode) this.spacer.remove();
    this.pool.length = 0;
  }

  _updateSpacer() {
    this.spacer.style.height = this.data.length * this.itemHeight + "px";
  }

  _render() {
    const total = this.data.length;
    const viewH = this.container.clientHeight;
    const scrollTop = this.container.scrollTop;
    const startIdx = Math.max(
      0,
      Math.floor(scrollTop / this.itemHeight) - this.overscan,
    );
    const visibleCount =
      Math.ceil(viewH / this.itemHeight) + this.overscan * 2;
    const endIdx = Math.min(total, startIdx + visibleCount);
    const needed = Math.max(0, endIdx - startIdx);

    // Grow / shrink the pool to match the visible row count.
    while (this.pool.length < needed) {
      const wrapper = document.createElement("div");
      wrapper.style.position = "absolute";
      wrapper.style.left = "0";
      wrapper.style.right = "0";
      wrapper.style.height = this.itemHeight + "px";
      this.spacer.appendChild(wrapper);
      this.pool.push({ wrapper, idx: -1 });
    }
    while (this.pool.length > needed) {
      const item = this.pool.pop();
      item.wrapper.remove();
    }

    // Place + render each pool slot.
    for (let i = 0; i < this.pool.length; i++) {
      const idx = startIdx + i;
      const slot = this.pool[i];
      if (slot.idx === idx) continue;
      slot.idx = idx;
      slot.wrapper.style.transform =
        "translateY(" + idx * this.itemHeight + "px)";
      while (slot.wrapper.firstChild)
        slot.wrapper.removeChild(slot.wrapper.firstChild);
      const el = this.renderItem(this.data[idx], idx);
      if (el) slot.wrapper.appendChild(el);
    }

    if (this.onAfterRender) this.onAfterRender();
  }
}
