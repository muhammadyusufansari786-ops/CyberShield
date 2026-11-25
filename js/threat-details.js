/* CyberShield - reusable threat detail page renderer.
   Reads ?id=<slug> and renders one entry from data/threat-details.json.
   All data text is inserted with textContent / createTextNode, never innerHTML. */
(function () {
  'use strict';

  var DATA_URL = '../data/threat-details.json';
  var ASSET_PREFIX = '';
  var PAGE_TITLE = 'Threat details – CyberShield';

  var ui = {
    status: document.getElementById('threat-status'),
    detail: document.getElementById('threat-detail'),
    crumb: document.getElementById('threat-crumb'),
    image: document.getElementById('threat-image'),
    imageFallback: document.getElementById('threat-image-fallback'),
    fallbackIcon: document.getElementById('threat-fallback-icon'),
    fallbackText: document.getElementById('threat-fallback-text'),
    category: document.getElementById('threat-category'),
    icon: document.getElementById('threat-icon'),
    title: document.getElementById('threat-title'),
    tagline: document.getElementById('threat-tagline'),
    body: document.getElementById('threat-body'),
    toolkit: document.getElementById('threat-toolkit'),
    notFound: document.getElementById('threat-not-found'),
    notFoundTitle: document.getElementById('threat-notfound-title'),
    notFoundText: document.getElementById('threat-notfound-text'),
    notFoundList: document.getElementById('threat-notfound-list'),
    metaDescription: document.querySelector('meta[name="description"]')
  };

  if (!ui.status || !ui.detail || !ui.title) return;

  // Keep the shared navigation drawer pointing at the threats section.
  var threatsNavLink = document.querySelector('.nav-drawer-link[href="threats.html"]');
  if (threatsNavLink) {
    threatsNavLink.classList.add('active');
    threatsNavLink.setAttribute('aria-current', 'page');
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function slugify(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function block(title, icon, extraClass) {
    var section = el('section', 'detail-block' + (extraClass ? ' ' + extraClass : ''));
    var heading = el('h2', 'detail-block-title');
    var badge = el('span', 'detail-block-icon', icon);
    badge.setAttribute('aria-hidden', 'true');
    heading.appendChild(badge);
    heading.appendChild(document.createTextNode(title));
    section.appendChild(heading);
    return section;
  }

  function bulletList(items, className) {
    var list = el('ul', className || 'detail-list');
    items.forEach(function (item) {
      list.appendChild(el('li', null, item));
    });
    return list;
  }

  function numberedList(items, className) {
    var list = el('ol', className || 'detail-steps');
    items.forEach(function (item, index) {
      var li = el('li', 'detail-step');
      li.appendChild(el('span', 'detail-step-number', String(index + 1)));
      li.appendChild(el('p', 'detail-step-text', item));
      list.appendChild(li);
    });
    return list;
  }

  function glossaryChips(terms) {
    var wrap = el('div', 'detail-chips');
    terms.forEach(function (term) {
      var link = el('a', 'detail-chip', term);
      link.href = 'glossary.html?term=' + encodeURIComponent(term);
      wrap.appendChild(link);
    });
    return wrap;
  }

  function threatCard(threat, sizeClass) {
    var card = el('a', 'related-card' + (sizeClass ? ' ' + sizeClass : ''));
    card.href = 'threat-details.html?id=' + encodeURIComponent(threat.id);

    var thumb = el('span', 'related-card-thumb');
    var img = document.createElement('img');
    img.src = ASSET_PREFIX + threat.image;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = 160;
    img.height = 84;
    img.addEventListener('error', function () {
      img.remove();
      thumb.appendChild(el('span', 'related-card-thumb-icon', threat.icon));
    });
    thumb.appendChild(img);

    var text = el('span', 'related-card-text');
    text.appendChild(el('span', 'related-card-name', threat.name));
    text.appendChild(el('span', 'related-card-tagline', threat.tagline));

    card.appendChild(thumb);
    card.appendChild(text);
    return card;
  }

  function showImageFallback(threat) {
    if (!ui.image || !ui.imageFallback) return;
    if (ui.image.parentNode) ui.image.parentNode.classList.add('is-fallback');
    ui.image.hidden = true;
    ui.image.setAttribute('aria-hidden', 'true');
    ui.fallbackIcon.textContent = threat.icon;
    ui.fallbackText.textContent = threat.name;
    ui.imageFallback.hidden = false;
  }

  function buildBody(threat, all) {
    var body = ui.body;
    body.textContent = '';

    var overview = block('Overview', '🧭');
    overview.appendChild(el('p', 'detail-overview', threat.overview));
    body.appendChild(overview);

    var how = block('How it works', '⚙️');
    how.appendChild(numberedList(threat.howItWorks));
    body.appendChild(how);

    var example = block('Real-world example', '📌');
    var figure = el('figure', 'detail-case');
    figure.appendChild(el('blockquote', 'detail-case-quote', threat.example));
    figure.appendChild(el('figcaption', 'detail-case-caption', 'A typical pattern — details are anonymised.'));
    example.appendChild(figure);
    body.appendChild(example);

    var signs = block('Warning signs', '⚠️', 'detail-block--alert');
    signs.appendChild(el('p', 'detail-lede', 'Seeing one or two of these is a reason to slow down and check.'));
    signs.appendChild(bulletList(threat.warningSigns, 'detail-signs'));
    body.appendChild(signs);

    var risks = block('What you could lose', '🎯');
    risks.appendChild(bulletList(threat.risks, 'detail-risks'));
    body.appendChild(risks);

    var prevention = block('How to protect yourself', '🛡️', 'detail-block--safe');
    prevention.appendChild(bulletList(threat.prevention, 'detail-checklist'));
    body.appendChild(prevention);

    var emergency = block('If it happens to you', '🚨', 'detail-block--emergency');
    var steps = el('ol', 'detail-emergency-list');
    threat.emergency.forEach(function (step, index) {
      var li = el('li', 'detail-emergency-step');
      li.appendChild(el('span', 'detail-emergency-number', String(index + 1)));
      li.appendChild(el('p', null, step));
      steps.appendChild(li);
    });
    emergency.appendChild(steps);
    var help = el('p', 'detail-emergency-note');
    help.appendChild(document.createTextNode('Need guided help? '));
    var helpLink = el('a', 'detail-inline-link', 'Open the emergency toolkit');
    helpLink.href = 'toolkit.html?incident=' + encodeURIComponent(threat.emergencyGuide);
    help.appendChild(helpLink);
    help.appendChild(document.createTextNode(' or report at cybercrime.gov.in (helpline 1930).'));
    emergency.appendChild(help);
    body.appendChild(emergency);

    if (threat.glossary && threat.glossary.length) {
      var terms = block('Related terms', '📖');
      terms.appendChild(glossaryChips(threat.glossary));
      body.appendChild(terms);
    }

    var related = (threat.related || [])
      .map(function (id) {
        return all.filter(function (item) { return item.id === id; })[0];
      })
      .filter(Boolean);

    if (related.length) {
      var relatedBlock = block('Related threats', '🔗');
      var grid = el('div', 'related-grid');
      related.forEach(function (item) {
        grid.appendChild(threatCard(item));
      });
      relatedBlock.appendChild(grid);
      body.appendChild(relatedBlock);
    }
  }

  function renderThreat(threat, all) {
    ui.crumb.textContent = threat.name;
    document.title = threat.name + ' – CyberShield';
    if (ui.metaDescription) {
      ui.metaDescription.setAttribute(
        'content',
        threat.name + ': ' + threat.tagline + ' Learn how it works, warning signs, prevention and what to do if it happens to you.'
      );
    }

    ui.image.addEventListener('error', function () { showImageFallback(threat); });
    ui.image.src = ASSET_PREFIX + threat.image;
    ui.image.alt = threat.imageAlt;
    ui.fallbackIcon.textContent = threat.icon;
    ui.fallbackText.textContent = threat.name;

    ui.icon.textContent = threat.icon;
    ui.category.textContent = threat.categoryLabel;
    ui.category.className = 'badge badge-' + (threat.category || 'social');
    ui.title.textContent = threat.name;
    ui.tagline.textContent = threat.tagline;
    ui.toolkit.href = 'toolkit.html?incident=' + encodeURIComponent(threat.emergencyGuide);

    buildBody(threat, all);

    ui.status.hidden = true;
    ui.notFound.hidden = true;
    ui.detail.hidden = false;
    window.scrollTo(0, 0);
    try {
      ui.title.focus({ preventScroll: true });
    } catch (err) {
      /* older browsers: focus without options */
      ui.title.focus();
    }
  }

  function showNotFound(all, message) {
    document.title = 'Threat not found – CyberShield';
    ui.crumb.textContent = 'Not found';
    ui.status.hidden = true;
    ui.detail.hidden = true;
    ui.notFoundText.textContent = message;
    ui.notFoundList.textContent = '';

    (all || []).forEach(function (item) {
      var card = el('a', 'notfound-item');
      card.href = 'threat-details.html?id=' + encodeURIComponent(item.id);
      card.appendChild(el('span', 'notfound-item-icon', item.icon));
      var text = el('span', 'notfound-item-text');
      text.appendChild(el('span', 'notfound-item-name', item.name));
      text.appendChild(el('span', 'notfound-item-cat', item.categoryLabel));
      card.appendChild(text);
      ui.notFoundList.appendChild(card);
    });

    ui.notFound.hidden = false;
    window.scrollTo(0, 0);
  }

  function showLoadError() {
    ui.status.textContent = '';
    ui.status.appendChild(document.createTextNode('We could not load the threat library. Check your connection and try again. '));
    var retry = el('button', 'btn btn-secondary btn-sm', 'Retry');
    retry.type = 'button';
    retry.addEventListener('click', function () {
      ui.status.textContent = 'Loading threat details…';
      init();
    });
    ui.status.appendChild(retry);
    ui.status.classList.add('threat-status--error');
  }

  function init() {
    var params = new URLSearchParams(window.location.search);
    var rawId = (params.get('id') || '').trim();
    var wanted = slugify(rawId);

    if (!rawId) {
      document.title = 'Threat not found – CyberShield';
      ui.status.textContent = 'No threat was selected. Choose one from the list below.';
      ui.status.hidden = true;
      ui.notFoundTitle.textContent = 'No threat selected';
      ui.notFoundText.textContent = 'Pick a threat below, or browse the full list on the Common Threats page.';
      ui.crumb.textContent = 'Not found';
      ui.detail.hidden = true;
      ui.notFound.hidden = false;
      fetch(DATA_URL, { cache: 'no-cache' })
        .then(function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.json();
        })
        .then(function (all) {
          ui.notFoundList.textContent = '';
          all.forEach(function (item) {
            var card = el('a', 'notfound-item');
            card.href = 'threat-details.html?id=' + encodeURIComponent(item.id);
            card.appendChild(el('span', 'notfound-item-icon', item.icon));
            var text = el('span', 'notfound-item-text');
            text.appendChild(el('span', 'notfound-item-name', item.name));
            text.appendChild(el('span', 'notfound-item-cat', item.categoryLabel));
            card.appendChild(text);
            ui.notFoundList.appendChild(card);
          });
        })
        .catch(function () {
          ui.notFoundText.textContent = 'Pick a threat from the Common Threats page while we reconnect.';
        });
      window.scrollTo(0, 0);
      return;
    }

    fetch(DATA_URL, { cache: 'no-cache' })
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (all) {
        if (!Array.isArray(all) || !all.length) {
          showLoadError();
          return;
        }
        var threat = all.filter(function (item) {
          return item.id === rawId || item.id === wanted;
        })[0];

        if (!threat) {
          showNotFound(all, 'We could not find a threat called “' + rawId + '”. It may have been renamed — pick one of the ' + all.length + ' threats below.');
          return;
        }
        renderThreat(threat, all);
      })
      .catch(function () {
        showLoadError();
      });
  }

  init();
})();
