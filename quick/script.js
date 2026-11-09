export default class SupportPalestineBanner extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.isRendered = false;
    this.handlePointerDown = (event) => {
      if (this.isExpanded() && !event.composedPath().includes(this)) {
        this.setExpanded(false);
      }
    };
    this.handleKeyDown = (event) => {
      if (event.key === 'Escape' && this.isExpanded()) {
        this.setExpanded(false);
        this.toggleButton.focus();
      }
    };
    this.createStyles();
  }

  createStyles() {
    const style = document.createElement('style');
    style.textContent = `
      :host {
        display: block;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        width: 100%;
        z-index: 10000;
        height: 0;
        font-family: Arial, sans-serif;
      }
      * {
        box-sizing: border-box;
      }
      .support-palestine__toggle {
        position: absolute;
        inset: 0 0 auto;
        width: 100%;
        height: 34px;
        padding: 0 16px;
        border: 0;
        background: #111;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        cursor: pointer;
        font: inherit;
        font-size: 13px;
      }
      .support-palestine__toggle:hover,
      .support-palestine__toggle:focus-visible {
        background: #242424;
      }
      .support-palestine__toggle:focus-visible,
      .donation-link:focus-visible {
        outline: 2px solid #fff;
        outline-offset: -3px;
      }
      .support-palestine__label {
        line-height: 1.4;
      }
      .support-palestine__chevron {
        width: 8px;
        height: 8px;
        border-right: 1.5px solid currentColor;
        border-bottom: 1.5px solid currentColor;
        transform: translateY(-2px) rotate(45deg);
      }
      .support-palestine__toggle[aria-expanded="true"] .support-palestine__chevron {
        transform: translateY(2px) rotate(225deg);
      }
      .support-palestine__panel {
        position: absolute;
        top: 34px;
        left: 0;
        width: 100%;
        padding: 5px 0 8px;
        border-top: 1px solid #454545;
        background: #111;
      }
      .support-palestine__panel[hidden] {
        display: none;
      }
      .donation-heading {
        margin: 4px 14px 8px;
        color: #ddd;
        font-size: 12px;
        font-weight: 600;
      }
      .donation-list {
        display: grid;
        gap: 0;
      }
      .donation-link,
      .donation-link:visited {
        min-height: 56px;
        padding: 9px 14px;
        border: 0;
        border-top: 1px solid #383838;
        background: transparent;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        text-decoration: none;
      }
      .donation-link:hover {
        background: #242424;
      }
      .donation-link:last-child {
        border-bottom: 1px solid #383838;
      }
      .donation-copy {
        display: grid;
        gap: 4px;
        min-width: 0;
      }
      .donation-name {
        font-size: 13px;
        font-weight: 600;
      }
      .donation-note {
        color: #c4c4c4;
        font-size: 11px;
        line-height: 1.4;
      }
      .donation-region {
        flex: 0 0 auto;
        color: #d7d7d7;
        font-size: 10px;
        text-align: right;
      }
      .support-palestine__flag {
        width: 40px;
        height: 21px;
        flex: 0 0 40px;
        position: relative;
        overflow: hidden;
      }
      .background {
        height: 21px;
        background: linear-gradient(to bottom, #111 0 33.33%, #fff 33.33% 66.66%, #08743b 66.66% 100%);
      }
      .top {
        display: none;
      }
      .triangle {
        position: absolute;
        inset: 0 auto 0 0;
        border-top: 10.5px solid transparent;
        border-bottom: 10.5px solid transparent;
        border-left: 17px solid #e5243b;
      }
    `;
    this.shadowRoot.appendChild(style);
  }

  connectedCallback() {
    if (!this.isRendered) {
      this.render();
      this.isRendered = true;
    }
    document.addEventListener('pointerdown', this.handlePointerDown);
    document.addEventListener('keydown', this.handleKeyDown);
  }

  disconnectedCallback() {
    document.removeEventListener('pointerdown', this.handlePointerDown);
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  isExpanded() {
    return this.toggleButton?.getAttribute('aria-expanded') === 'true';
  }

  setExpanded(expanded) {
    this.toggleButton.setAttribute('aria-expanded', String(expanded));
    this.donationPanel.hidden = !expanded;
  }

  render() {
    const fragment = document.createDocumentFragment();

    const toggleButton = document.createElement('button');
    toggleButton.className = 'support-palestine__toggle';
    toggleButton.type = 'button';
    toggleButton.setAttribute('aria-expanded', 'false');
    toggleButton.setAttribute('aria-controls', 'donation-options');
    toggleButton.setAttribute('aria-label', 'Pilih jalur donasi untuk Palestina');

    const flag = document.createElement('div');
    flag.className = 'support-palestine__flag';
    flag.setAttribute('aria-hidden', 'true');

    const background = document.createElement('div');
    background.className = 'background';

    const top = document.createElement('div');
    top.className = 'top';
    background.appendChild(top);

    const middle = document.createElement('div');
    middle.className = 'middle';
    background.appendChild(middle);

    const triangle = document.createElement('div');
    triangle.className = 'triangle';
    background.appendChild(triangle);

    flag.appendChild(background);
    toggleButton.appendChild(flag);

    const label = document.createElement('div');
    label.className = 'support-palestine__label';
    label.textContent = 'Salurkan donasi terbaik anda untuk saudara kita di Palestina';
    toggleButton.appendChild(label);

    const chevron = document.createElement('span');
    chevron.className = 'support-palestine__chevron';
    chevron.setAttribute('aria-hidden', 'true');
    toggleButton.appendChild(chevron);

    const panel = document.createElement('section');
    panel.className = 'support-palestine__panel';
    panel.id = 'donation-options';
    panel.setAttribute('aria-label', 'Pilihan donasi Palestina');
    panel.hidden = true;

    const heading = document.createElement('h2');
    heading.className = 'donation-heading';
    heading.textContent = 'Pilih jalur donasi';
    panel.appendChild(heading);

    const donationList = document.createElement('div');
    donationList.className = 'donation-list';

    const donationOptions = [
      {
        name: 'BAZNAS - Bantu Jutaan Muslim Palestina',
        note: 'Donasi khusus Palestina melalui kanal resmi BAZNAS.',
        region: 'Indonesia',
        href: 'https://donasi.baznas.go.id/donasi/bantumuslimdipalestina'
      },
      {
        name: 'Japanese Red Cross Society',
        note: 'Donasi umum untuk kegiatan kemanusiaan, bukan khusus Palestina.',
        region: 'Jepang',
        href: 'https://www.jrc.or.jp/english/donate/'
      },
      {
        name: 'Islamic Relief - Palestine Appeal',
        note: 'Kampanye khusus bantuan kemanusiaan di Palestina.',
        region: 'Internasional',
        href: 'https://www.islamic-relief.org.uk/giving/appeals/palestine/'
      }
    ];

    donationOptions.forEach((option) => {
      const link = document.createElement('a');
      link.className = 'donation-link';
      link.href = option.href;
      link.target = '_blank';
      link.rel = 'nofollow noopener noreferrer';

      const copy = document.createElement('span');
      copy.className = 'donation-copy';

      const name = document.createElement('span');
      name.className = 'donation-name';
      name.textContent = option.name;

      const note = document.createElement('span');
      note.className = 'donation-note';
      note.textContent = option.note;

      const region = document.createElement('span');
      region.className = 'donation-region';
      region.textContent = option.region;

      copy.append(name, note);
      link.append(copy, region);
      donationList.appendChild(link);
    });

    panel.appendChild(donationList);

    toggleButton.addEventListener('click', () => {
      this.setExpanded(!this.isExpanded());
    });

    this.toggleButton = toggleButton;
    this.donationPanel = panel;
    fragment.append(toggleButton, panel);
    this.shadowRoot.appendChild(fragment);
  }
}

customElements.define("support-palestine-banner", SupportPalestineBanner);