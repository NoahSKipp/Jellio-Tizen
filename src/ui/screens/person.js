// Person screen with portrait, metadata chips, formatted bio, Known For row, and department filmography.
import { getPerson, getImageUrl, searchItems } from '../../data/api.js';
import {
  parseMarkdownBio,
  calculateAge,
  searchTmdbPersonId,
  fetchTmdbPersonDetails,
  buildRichPersonDetails,
  buildFallbackPersonDetails,
  filterCreditsForDepartment,
} from '../../runtime/personProfile.js';
import { focusFirstIn, focusElement } from '../../input/spatialNav.js';

export class PersonScreen {
  constructor(options = {}) {
    this.options = options;
    this.personId = options.personId || null;
    this.container = null;
    this.person = null;
    this.details = null;
    this.activeDepartment = 'Acting';
  }

  async render(container, personId = this.personId) {
    this.container = container;
    this.personId = personId;
    this.container.innerHTML = `
      <div class="jellio-screen" data-focus-group="person-screen">
        <div class="jellio-screen-scroll" id="person-scroll-container">
          <div class="jellio-person-header">
            <img class="jellio-person-portrait" id="person-portrait" alt="Portrait" />
            <div style="flex: 1; display: flex; flex-direction: column; gap: 14px;">
              <h1 class="jellio-title-hero" id="person-name" style="font-size: 40px;">Loading...</h1>
              <div id="person-meta-chips" style="display: flex; gap: 8px; align-items: center; font-size: 13px;"></div>
              <div class="jellio-person-bio" id="person-bio"></div>
            </div>
          </div>

          <div id="person-known-for-section" class="jellio-row-container" style="display: none;">
            <h2 class="jellio-row-title">Known For</h2>
            <div class="jellio-row-track" id="person-known-for-track"></div>
          </div>

          <div id="person-department-section" class="jellio-row-container" style="display: none;">
            <div style="display: flex; gap: 10px; margin-left: 48px; margin-bottom: 12px;" id="person-dept-tabs"></div>
            <div class="jellio-poster-grid" id="person-filmography-grid"></div>
          </div>
        </div>
      </div>
    `;

    await this.loadPerson();
  }

  async loadPerson() {
    if (!this.personId) return;
    try {
      this.person = await getPerson(this.personId);
      const name = this.person.Name || '';

      let tmdbData = null;
      try {
        const tmdbId = await searchTmdbPersonId(name, fetch);
        if (tmdbId) {
          tmdbData = await fetchTmdbPersonDetails(tmdbId, fetch);
        }
      } catch (_) {}

      let localFilmography = [];
      try {
        const searchRes = await searchItems(name, 50);
        localFilmography = searchRes.Items || [];
      } catch (_) {}

      if (tmdbData) {
        this.details = buildRichPersonDetails(this.personId, this.person, tmdbData, localFilmography);
      } else {
        this.details = buildFallbackPersonDetails(this.personId, this.person, localFilmography);
      }

      this.renderHeader();
      this.renderKnownFor();
      this.renderDepartmentFilmography();

      focusFirstIn(this.container);
    } catch (err) {
      console.warn('PersonScreen: failed loading person', err);
    }
  }

  renderHeader() {
    const portraitEl = this.container.querySelector('#person-portrait');
    const nameEl = this.container.querySelector('#person-name');
    const chipsEl = this.container.querySelector('#person-meta-chips');
    const bioEl = this.container.querySelector('#person-bio');

    const name = this.details.name || this.person.Name;
    nameEl.textContent = name;

    const imgTag = this.person.PrimaryImageTag || (this.person.ImageTags && this.person.ImageTags.Primary);
    portraitEl.src = getImageUrl(this.personId, imgTag, 'Primary', 400);

    const chips = [];
    if (this.details.birthday) {
      const age = calculateAge(this.details.birthday, this.details.deathday);
      chips.push(age !== null ? `Age: ${age}` : this.details.birthday);
    }
    if (this.details.placeOfBirth) {
      chips.push(this.details.placeOfBirth);
    }
    if (this.details.knownForDepartment) {
      chips.push(this.details.knownForDepartment);
    }

    chipsEl.innerHTML = chips.map((c) => `<span class="jellio-tech-badge">${c}</span>`).join('');

    const rawBio = this.details.biography || this.person.Overview || '';
    const bioSegments = parseMarkdownBio(rawBio);
    if (bioSegments.length > 0) {
      bioEl.innerHTML = bioSegments.map((s) => {
        if (s.bold) return `<strong>${s.text}</strong>`;
        if (s.italic) return `<em>${s.text}</em>`;
        return s.text;
      }).join('');
    } else {
      bioEl.textContent = 'No biography available.';
    }
  }

  renderKnownFor() {
    const section = this.container.querySelector('#person-known-for-section');
    const track = this.container.querySelector('#person-known-for-track');
    const knownFor = this.details.knownFor || [];

    if (knownFor.length === 0) return;
    section.style.display = 'flex';
    track.innerHTML = '';

    knownFor.forEach((credit) => {
      const card = document.createElement('div');
      card.className = 'jellio-poster-card jellio-card-portrait';
      card.setAttribute('data-focusable', 'true');

      const imgUrl = credit.posterUrl || getImageUrl(credit.id, null, 'Primary', 300);
      card.innerHTML = `
        <img class="jellio-poster-card-img" src="${imgUrl}" alt="${credit.title}" loading="lazy" />
        <div class="jellio-poster-card-overlay">
          <div class="jellio-poster-card-title">${credit.title}</div>
          <div class="jellio-poster-card-subtitle">${credit.year || credit.character || ''}</div>
        </div>
      `;

      card.onclick = () => {
        if (this.options.onNavigateToItem) {
          this.options.onNavigateToItem(credit.id || credit.title);
        }
      };

      track.appendChild(card);
    });
  }

  renderDepartmentFilmography() {
    const section = this.container.querySelector('#person-department-section');
    const tabsContainer = this.container.querySelector('#person-dept-tabs');
    const grid = this.container.querySelector('#person-filmography-grid');

    const departments = this.details.departments || ['Acting', 'Directing', 'Writing'];
    section.style.display = 'flex';
    tabsContainer.innerHTML = '';

    departments.forEach((dept) => {
      const tabBtn = document.createElement('button');
      tabBtn.className = `jellio-filter-pill ${dept === this.activeDepartment ? 'jellio-focused' : ''}`;
      tabBtn.setAttribute('data-focusable', 'true');
      tabBtn.textContent = dept;

      tabBtn.onclick = () => {
        this.activeDepartment = dept;
        Array.from(tabsContainer.children).forEach((c) => c.classList.remove('jellio-focused'));
        tabBtn.classList.add('jellio-focused');
        this.populateFilmographyGrid(dept, grid);
      };

      tabsContainer.appendChild(tabBtn);
    });

    this.populateFilmographyGrid(this.activeDepartment, grid);
  }

  populateFilmographyGrid(dept, grid) {
    grid.innerHTML = '';
    const allCredits = this.details.allCredits || [];
    const filtered = filterCreditsForDepartment(dept, allCredits);

    filtered.forEach((credit) => {
      const card = document.createElement('div');
      card.className = 'jellio-poster-card jellio-card-portrait';
      card.setAttribute('data-focusable', 'true');

      const imgUrl = credit.posterUrl || getImageUrl(credit.id, null, 'Primary', 300);
      card.innerHTML = `
        <img class="jellio-poster-card-img" src="${imgUrl}" alt="${credit.title}" loading="lazy" />
        <div class="jellio-poster-card-overlay">
          <div class="jellio-poster-card-title">${credit.title}</div>
          <div class="jellio-poster-card-subtitle">${credit.year || ''}</div>
        </div>
      `;

      card.onclick = () => {
        if (this.options.onNavigateToItem) {
          this.options.onNavigateToItem(credit.id || credit.title);
        }
      };

      grid.appendChild(card);
    });
  }

  destroy() {
    this.person = null;
    this.details = null;
  }
}
