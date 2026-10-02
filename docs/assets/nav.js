// 사이드바 네비게이션 — 모든 문서 페이지가 공유한다. 각 페이지는 이 스크립트를 로드하기 전에
// `window.DOCS_BASE`를 정의해야 한다: 루트(index.html)는 '', 서브페이지(components/*, tokens/*)는 '../'.
// 링크 href는 이 파일 안에서 DOCS_BASE를 붙여 조립하므로 트리 구조는 여기 한 곳만 고치면 된다.

(function () {
  var BASE = window.DOCS_BASE || '';
  var THEME_KEY = 'bluesoft-docs-theme';

  // 저장된 다크모드 선호를 최대한 일찍 적용한다 — render() 전에 실행해 깜빡임을 줄인다.
  try {
    var storedTheme = localStorage.getItem(THEME_KEY);
    if (storedTheme === 'dark' || storedTheme === 'light') {
      document.documentElement.setAttribute('data-theme', storedTheme);
    }
  } catch (e) {}

  var NAV = [
    {
      standalone: true,
      icon: 'home',
      label: 'Introduction',
      href: BASE + 'index.html',
    },
    {
      icon: 'grid',
      label: 'Tokens',
      href: BASE + 'tokens/colors.html',
      children: [
        { label: 'Colors', href: BASE + 'tokens/colors.html' },
        { label: 'Spacing & Radius', href: BASE + 'tokens/spacing.html' },
        { label: 'Typography', href: BASE + 'tokens/typography.html' },
      ],
    },
    {
      icon: 'layout',
      label: 'Basic',
      href: BASE + 'components/button.html',
      children: [
        { label: 'Button', href: BASE + 'components/button.html' },
        { label: 'Icon Button', href: BASE + 'components/icon-button.html' },
        { label: 'Social Button', href: BASE + 'components/social-button.html' },
        { label: 'Badge', href: BASE + 'components/badge.html' },
        { label: 'Con', href: BASE + 'components/con-chip.html' },
        { label: 'Tabs', href: BASE + 'components/tabs.html' },
      ],
    },
    {
      icon: 'edit',
      label: 'Form',
      href: BASE + 'components/input.html',
      children: [
        { label: 'Input', href: BASE + 'components/input.html' },
        { label: 'Textarea', href: BASE + 'components/textarea.html' },
        { label: 'Checkbox & Radio & Toggle', href: BASE + 'components/checkbox-radio.html' },
        { label: 'Dropdown & Select', href: BASE + 'components/dropdown-select.html' },
        { label: 'Upload', href: BASE + 'components/upload.html' },
      ],
    },
    {
      icon: 'bell',
      label: 'Feedback',
      href: BASE + 'components/alert.html',
      children: [
        { label: 'Alert', href: BASE + 'components/alert.html' },
        { label: 'Modal', href: BASE + 'components/modal.html' },
        { label: 'Tooltip & Help Icon', href: BASE + 'components/tooltip.html' },
        { label: 'Progress Bar', href: BASE + 'components/progress-bar.html' },
        { label: 'Featured Icon', href: BASE + 'components/featured-icon.html' },
      ],
    },
    {
      icon: 'bar-chart',
      label: 'Data',
      href: BASE + 'components/table.html',
      children: [
        { label: 'Table', href: BASE + 'components/table.html' },
        { label: 'Board', href: BASE + 'components/board.html' },
        { label: 'Calendar', href: BASE + 'components/calendar.html' },
        { label: 'Card', href: BASE + 'components/card.html' },
        { label: 'Accordion', href: BASE + 'components/accordion.html' },
        { label: 'Avatar Group', href: BASE + 'components/avatar-group.html' },
        { label: 'Pagination', href: BASE + 'components/pagination.html' },
      ],
    },
    {
      icon: 'menu',
      label: 'Navigation',
      href: BASE + 'components/side-nav-item.html',
      children: [
        { label: 'Side Nav Item', href: BASE + 'components/side-nav-item.html' },
        { label: 'Scrollbar', href: BASE + 'components/scrollbar.html' },
        { label: 'Header', href: BASE + 'components/header.html' },
        { label: 'Logo', href: BASE + 'components/logo.html' },
        { label: 'Login Header', href: BASE + 'components/login-header.html' },
      ],
    },
  ];

  function iconSvg(name, cls) {
    return (
      '<svg class="' + (cls || 'bds-side-nav-item__icon') + '"><use href="' +
      BASE +
      'assets/icons/sprite.svg#icon-base-' +
      name +
      '"></use></svg>'
    );
  }

  function itemHtml(item, isChild) {
    var classes = 'bds-side-nav-item bds-side-nav-item-light' + (isChild ? ' bds-side-nav-item-sub' : '');
    var content = isChild
      ? item.label
      : '<span class="bds-side-nav-item__content">' + iconSvg(item.icon) + '<span class="bds-side-nav-item__label">' + item.label + '</span></span>';
    var attrs = isChild ? ' data-nav-child' : '';
    return '<a class="' + classes + '" data-nav' + attrs + ' href="' + item.href + '">' + content + '</a>';
  }

  function groupMatchesCurrentFile(group, currentFile) {
    if (group.href.split('/').pop() === currentFile) return true;
    return group.children.some(function (child) {
      return child.href.split('/').pop() === currentFile;
    });
  }

  function render() {
    var mount = document.getElementById('sidebar-mount');
    if (!mount) return;

    var html = '';
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    html += '<div class="doc-sidebar__header">';
    html += '<a href="' + BASE + 'index.html"><img class="bds-logo" src="' + BASE + 'assets/logo/logo-brand.svg" alt="BLUESOFT" /></a>';
    html += '<button type="button" class="bds-icon-btn bds-icon-btn-sm bds-icon-btn-ghost" id="doc-theme-toggle" aria-label="다크모드 전환">' +
      iconSvg(isDark ? 'sun' : 'moon', 'bds-icon icon-sm') +
      '</button>';
    html += '</div>';
    html += '<div class="doc-sidebar__search">' +
      '<div class="bds-input bds-input-md bds-input-normal"><div class="bds-input__field"><div class="bds-input__content">' +
      '<svg class="bds-input__icon"><use href="' + BASE + 'assets/icons/sprite.svg#icon-base-search"></use></svg>' +
      '<input class="bds-input__control" id="doc-search" placeholder="컴포넌트 검색" autocomplete="off" />' +
      '</div></div></div></div>';

    var currentFile = location.pathname.split('/').pop() || 'index.html';

    html += '<div class="doc-sidebar__nav">';
    NAV.forEach(function (group, groupIndex) {
      if (group.standalone) {
        html += '<div class="doc-nav-group">' + itemHtml(group, false) + '</div>';
        return;
      }
      // 현재 페이지가 이 그룹 안에 있나 — 펼침 여부와 선택 표시를 둘 다 이걸로 정한다.
      // 선택 표시는 렌더 시점에 한 번 박는다. 검색·아코디언이 펼침 상태를 바꿔도
      // 따라 움직이면 안 된다(그건 "현재 페이지"와 무관하다).
      var isOpen = groupMatchesCurrentFile(group, currentFile);
      html += '<div class="doc-nav-group' + (isOpen ? ' is-open' : '') + '" data-nav-group data-default-open="' + isOpen + '">';
      // 헤더는 링크다 — 누르면 그 그룹의 첫 하위 페이지로 간다. 펼침은 chevron 이 맡는다.
      // 둘을 형제로 두는 이유는 <a> 안에 <button> 을 넣으면 중첩 상호작용 요소가 되기 때문이다.
      //
      // 헤더에 data-nav 를 달지 않는다. 그 표시는 href 가 현재 파일과 같을 때만 붙는데,
      // 여기서는 그룹 안 어느 페이지에 있든 붙어야 한다(2e70d36) — 그래서 렌더 시점에 직접 박는다.
      var childrenId = 'doc-nav-children-' + groupIndex;
      html += '<div class="doc-nav-group__header">';
      html += '<a class="bds-side-nav-item bds-side-nav-item-light' +
        (isOpen ? ' bds-side-nav-item-selected' : '') + '" href="' + group.children[0].href + '">';
      html += '<span class="bds-side-nav-item__content">' + iconSvg(group.icon) +
        '<span class="bds-side-nav-item__label">' + group.label + '</span></span>';
      html += '</a>';
      html += '<button type="button" class="doc-nav-group__toggle" data-nav-toggle' +
        ' aria-expanded="' + isOpen + '" aria-controls="' + childrenId + '" aria-label="하위 메뉴 펼치기/접기">';
      html += iconSvg('chevron-right', 'bds-icon icon-sm doc-nav-group__chevron');
      html += '</button>';
      html += '</div>';
      html += '<div class="doc-nav-group__children" id="' + childrenId + '" data-nav-children><div class="doc-nav-group__children-inner">';
      group.children.forEach(function (child) {
        html += itemHtml(child, true);
      });
      html += '</div></div>';
      html += '</div>';
    });
    html += '</div>';

    html += '<div class="doc-sidebar__footer">' +
      '<a class="bds-side-nav-item bds-side-nav-item-light" href="https://github.com/bluesmurflenda/bluesoft-design-system" target="_blank" rel="noopener">' +
      '<span class="bds-side-nav-item__content">' + iconSvg('external-link') + '<span class="bds-side-nav-item__label">GitHub 저장소</span></span>' +
      '</a></div>';

    mount.innerHTML = html;

    // 현재 페이지 강조 — pathname 끝부분(파일명)을 비교한다.
    mount.querySelectorAll('[data-nav]').forEach(function (a) {
      var hrefFile = a.getAttribute('href').split('/').pop();
      a.classList.toggle('bds-side-nav-item-selected', hrefFile === currentFile);
    });

    // 아코디언 — 한 번에 하나의 그룹만 펼쳐진다. chevron 만 토글하고 헤더 링크는 이동한다.
    var navGroups = mount.querySelectorAll('[data-nav-group]');
    navGroups.forEach(function (group) {
      var toggle = group.querySelector('[data-nav-toggle]');
      toggle.addEventListener('click', function () {
        var willOpen = !group.classList.contains('is-open');
        navGroups.forEach(function (g) {
          g.classList.remove('is-open');
          g.querySelector('[data-nav-toggle]').setAttribute('aria-expanded', 'false');
        });
        if (willOpen) {
          group.classList.add('is-open');
          toggle.setAttribute('aria-expanded', 'true');
        }
      });
    });

    // 다크모드 토글 — main.css의 [data-theme='dark']는 이미 전 컴포넌트가 대응하므로
    // 여기서는 속성만 바꾸고 localStorage에 저장한다(페이지 이동 시 파일 맨 위 즉시-적용 코드가 읽는다).
    var themeToggle = document.getElementById('doc-theme-toggle');
    themeToggle.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      themeToggle.innerHTML = iconSvg(next === 'dark' ? 'sun' : 'moon', 'bds-icon icon-sm');
      try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    });

    // 검색 필터 — 하위 항목 텍스트로 필터링, 전부 숨겨진 그룹은 그룹째로 숨김.
    // 검색 중에는 아코디언과 무관하게 매치된 그룹을 전부 펼치고, 검색어를 지우면
    // 페이지 로드 시의 기본 상태(현재 페이지가 속한 그룹만 오픈)로 되돌린다.
    var searchInput = document.getElementById('doc-search');
    searchInput.addEventListener('input', function () {
      var q = searchInput.value.trim().toLowerCase();
      navGroups.forEach(function (group) {
        var children = group.querySelectorAll('[data-nav-child]');
        var anyVisible = false;
        children.forEach(function (child) {
          var match = !q || child.textContent.toLowerCase().indexOf(q) !== -1;
          child.classList.toggle('doc-search-hidden', !match);
          if (match) anyVisible = true;
        });
        group.classList.toggle('doc-search-hidden', !!q && !anyVisible);

        var toggle = group.querySelector('[data-nav-toggle]');
        if (!toggle) return;
        var shouldOpen = q ? anyVisible : group.dataset.defaultOpen === 'true';
        group.classList.toggle('is-open', shouldOpen);
        toggle.setAttribute('aria-expanded', String(shouldOpen));
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
