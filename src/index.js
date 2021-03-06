import { LitElement, html, css } from "../web_modules/lit-element.js";
import "../web_modules/@material/mwc-drawer.js";
import "../web_modules/@material/mwc-top-app-bar.js";
import "../web_modules/@material/mwc-icon-button.js";
import "../web_modules/@material/mwc-button.js";

import { Certificate } from "../web_modules/@pkijs/pkijs/pkijs.js";
import { fromBER } from "../web_modules/@pkijs/asn1js/asn1.js";

import { style as listStyle } from './mwc-list-item-css.js';
import './dismissable-item.js';

export class TokenItem extends LitElement {
  static styles = [
    listStyle,
    css`
      :host {
        width: 100%;
        height: 100%;
      }
      mwc-icon-button {
        display: none;
      }
      @media(hover: hover) {
        dismissable-item:hover mwc-icon-button {
          display: block;
        }
      }
      .mdc-list-item {
        height: 64px;
      }
      mwc-checkbox {
        padding-right: 14px;
      }
      dismissable-item {
        width: 100%;
        height: 100%;
        --item-bg-color: white;
        padding: 0px ! important;
        user-select: none;
      }
      div {
        background-color: #E53935;
      }
    `
  ];

  static get properties() {
    return { 
      token: { type: String },
      expiration: { type: String }
    };
  }

  onchange(ev) {
    this.dispatchEvent(new CustomEvent('change', { detail: { checked: ev.target.checked }}));
  }

  onremove(ev) {
    ev.stopPropagation();
    this.dispatchEvent(new Event('remove'));
  }

  render() {
    return html`
        <dismissable-item @remove=${this.onremove} role="listitem" class="mdc-list-item">
          <span class="mdc-list-item__text">
            ${this.token.substr(0, 8)}
            <span class="mdc-list-item__secondary-text">${new Date(+this.expiration)}</span>
          </span>
          <mwc-icon-button class="mdc-list-item__meta"
            aria-label="Delete item" title="Delete" icon="delete"
            @click=${this.onremove} tabindex="-1">
          </mwc-icon-button>
        </dismissable-item>
    `
  }
}

customElements.define('token-item', TokenItem);

class MainApplication extends LitElement {
  static styles = css`
  .drawer-content {
    padding: 0px 16px 0 16px;
  }
  .main-content {
    width: 100vw;
    min-height: 300px;
    padding: 48px 0 0 0;
    display: flex;
    flex-direction: column;
    flex-wrap: nowrap;
    justify-content: flex-start;
    align-items: center;
    align-content: stretch;
  }

  #tokens {
    width: 100%; 
  }

  hr {
    width: 100%;
  }
  `;

  tokens = [];

  async uploadTokens(ev) {
    const entries = await this.chooseFileSystemEntriesFlat({type: 'openDirectory'});
    const re = new RegExp('^token_[0-9_]+\.json$');

    this.tokens = [];

    for await (const entry of entries) {
      if (re.test(entry.name)) {
        const file = entry;
        const text = await file.text();
        const json = JSON.parse(text);
        this.tokens.push(json);
      }
    }
    this.requestUpdate();
  } 

  constructor() {
    super();
    this.fileSelect = document.createElement("input");
    this.fileSelect.type = "file";
  }

  async chooseFileSystemEntriesFlat(opts) {
    const dir = opts && opts.type == 'openDirectory';

    // Use Native Filesystem API is avaiable.
    if ('chooseFileSystemEntries' in window) {
      const handle = await window.chooseFileSystemEntries(opts);
      if (dir) {
        const files = [];
        for await (const entry of handle.getEntries()) {
          if (entry.isFile) {
            files.push(await entry.getFile());
          }
        }
        return files;
      } else {
        return await handle.getFile();
      }
    }

    return new Promise(resolve => {
      this.fileSelect.webkitdirectory = dir;
      this.fileSelect.click();
      this.fileSelect.addEventListener("change",
        _ => resolve(dir ? this.fileSelect.files : this.fileSelect.files[0]),
        { once: true }
      );
    });
  }

  async uploadCertificate(ev) {
    const file = await this.chooseFileSystemEntriesFlat();
    const contents = await file.arrayBuffer();
    this.loadCertificate(contents);
  } 

  async loadCertificate(certificateBuffer) {
    const asn1src = fromBER(certificateBuffer);
    this.certificate = new Certificate({ schema: asn1src.result });
  }

  // Kind of a layout hack
  async updateInfo(token) {
    const records = [{
      recordType: "text",
      data: {
        token: token.token,
        fingerprint: await this.certificate.getKeyHash(),
        gateway: "rsp-software-toolkit-gateway"
      }
    }];

    const replacer = (key, value) => {
      if (key === 'fingerprint') {
        return Array.prototype.map.call(new Uint8Array(value),
            x => ('00' + x.toString(16)).slice(-2)
          ).join('');
      }
      return value;
    }

    const info = this.shadowRoot.querySelector('#info');
    info.innerHTML = `
      <pre>records: ${JSON.stringify(records, replacer, '  ')}</pre>
    `;
  }

  async firstUpdated() {
    const drawer = this.shadowRoot.querySelector("mwc-drawer");
    const container = drawer.parentNode;
    container.addEventListener('MDCTopAppBar:nav', _ => {
      drawer.open = !drawer.open;
    });

    const tres = await fetch("files/token_20181111_130018.json");
    const json = await tres.json();
    this.tokens = [json];

    const res = await fetch("files/rsp.der");
    const certificateBuffer = await res.arrayBuffer();
    this.loadCertificate(certificateBuffer)
    this.updateInfo(this.tokens[this.tokens.length - 1]);
  }

  render() {
    return html`
      <mwc-drawer hasHeader type=modal>
        <span slot="title">Intel RSP Sensor NFC</span>
        <span slot="subtitle">Configure your NFC tags today</span>
        <div class="drawer-content">
          <p><a href="https://w3c.github.io/web-nfc/">Web NFC API specification</a></p>
        </div>
        <div slot="appContent">
          <mwc-top-app-bar>
            <mwc-icon-button slot="navigationIcon" icon="menu"></mwc-icon-button>
            <div slot="title">Intel RSP Sensor NFC</div>
          </mwc-top-app-bar>
          <div class="main-content">
            <mwc-button @click="${ev => this.uploadCertificate(ev)}">
              Upload Certificate
            </mwc-button>
            <mwc-button @click="${ev => this.uploadTokens(ev)}">
              Upload Tokens
            </mwc-button>
            <hr>
            <div id="tokens" role="list" class="mdc-list mdc-list--two-line">
              ${this.tokens.map(token => html`
                <token-item token=${token.token} expiration=${token.expirationTimestamp}
                  @click=${_ => this.updateInfo(token)}></token-item>
              `)}
            </div>
            <br>
            <div id="info">Information</div>
          </div>
        </div>
      </mwc-drawer>
    `;
  }
}

customElements.define("main-app", MainApplication);
