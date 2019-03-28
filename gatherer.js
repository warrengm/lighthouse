(function() {
  const tapTargetsSelector = 'button,a,input,textarea,select,option,[role=button],[role=checkbox],[role=link],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=option],[role=scrollbar],[role=slider],[role=spinbutton]';
  function getElementsInDocument(selector) {
    const realMatchesFn = window.__ElementMatches || window.Element.prototype.matches;
    /** @type {Array<Element>} */
    const results = [];

    /** @param {NodeListOf<Element>} nodes */
    const _findAllElements = nodes => {
      for (let i = 0, el; el = nodes[i]; ++i) {
        if (!selector || realMatchesFn.call(el, selector)) {
          results.push(el);
        }
        // If the element has a shadow root, dig deeper.
        if (el.shadowRoot) {
          _findAllElements(el.shadowRoot.querySelectorAll('*'));
        }
      }
    };
    _findAllElements(document.querySelectorAll('*'));

    return results;
  }
      function filterClientRectsWithinAncestorsVisibleScrollArea(element, clientRects) {
    const parent = element.parentElement;
    if (!parent) {
      return clientRects;
    }
    if (getComputedStyle(parent).overflowY !== 'visible') {
      const parentBCR = parent.getBoundingClientRect();
      clientRects = clientRects.filter(cr => rectContains(parentBCR, cr));
    }
    if (parent.parentElement && parent.parentElement.tagName !== 'BODY') {
      return filterClientRectsWithinAncestorsVisibleScrollArea(
      parent,
      clientRects
      );
    }
    return clientRects;
  }
      function elementIsPositionFixedOrSticky(element) {
    const {position} = getComputedStyle(element);
    if (position === 'fixed' || position === 'sticky') {
      return true;
    }
    if (element.parentElement) {
      return elementIsPositionFixedOrSticky(element.parentElement);
    }
    return false;
  }
      function disableFixedAndStickyElementPointerEvents() {
    const className = 'lighthouse-disable-point-events';
    const styleTag = document.createElement('style');
    styleTag.innerHTML = `.${className} { pointer-events: none }`;
    document.body.appendChild(styleTag);

    Array.from(document.querySelectorAll('*')).forEach(el => {
      if (['fixed', 'sticky'].includes(/** @type string */(getComputedStyle(el).position))) {
        el.classList.add(className);
      }
    });

    return function undo() {
      Array.from(document.getElementsByClassName(className)).forEach(el => {
        el.classList.remove(className);
      });
      styleTag.remove();
    };
  }
      function elementIsVisible(element) {
    const {overflowX, overflowY, display, visibility} = getComputedStyle(element);

    if (
      display === 'none' ||
    (visibility === 'collapse' && ['TR', 'TBODY', 'COL', 'COLGROUP'].includes(element.tagName))
    ) {
    // Element not displayed
      return false;
    }

    // only for block and inline-block, since clientWidth/Height are always 0 for inline elements
    if (display === 'block' || display === 'inline-block') {
    // if height/width is 0 and no overflow in that direction then
    // there's no content that the user can see and tap on
      if ((element.clientWidth === 0 && overflowX === 'hidden') ||
        (element.clientHeight === 0 && overflowY === 'hidden')) {
        return false;
      }
    }

    const parent = element.parentElement;
    if (parent && parent.tagName !== 'BODY') {
    // if a parent is invisible then the current element is also invisible
      return elementIsVisible(parent);
    }

    return true;
  }
      function elementHasAncestorTapTarget(element) {
    if (!element.parentElement) {
      return false;
    }
    if (element.parentElement.matches(tapTargetsSelector)) {
      return true;
    }
    return elementHasAncestorTapTarget(element.parentElement);
  }
      function elementCenterIsAtZAxisTop(el, elCenterPoint) {
    const topEl = document.elementFromPoint(
    elCenterPoint.x,
    elCenterPoint.y - document.documentElement.scrollTop
    );

    const isTop = topEl === el || el.contains(topEl);

    return (
      isTop
    );
  }
  function getVisibleClientRects(element) {
    if (!elementIsVisible(element)) {
      return [];
    }

    let clientRects = getClientRects(element);

    if (allClientRectsEmpty(clientRects)) {
      return [];
    }

    // Treating overflowing content in scroll containers as invisible could mean that
    // most of a given page is deemed invisible. But:
    // - tap targets audit doesn't consider different containers/layers
    // - having most content in an explicit scroll container is rare
    // - treating them as hidden only generates false passes, which is better than false failures
    // TODO: is this still needed?
    clientRects = filterClientRectsWithinAncestorsVisibleScrollArea(element, clientRects);

    return clientRects;
  }
      function pointIsInViewport(point) {
    const topOfScreen = document.documentElement.scrollTop;
    const bottomOfScreen = topOfScreen + window.innerHeight - 1;
    return point.y >= topOfScreen && point.y <= bottomOfScreen;
  }
      function truncate(str, maxLength) {
    if (str.length <= maxLength) {
      return str;
    }
    return str.slice(0, maxLength - 1) + '…';
  }
      function getClientRects(element) {
    const clientRects = Array.from(
    element.getClientRects()
    ).map(clientRect => {
    // Contents of DOMRect get lost when returned from Runtime.evaluate call,
    // so we convert them to plain objects.
      const {width, height, left, top, right, bottom} = clientRect;
      return {width, height, left, top, right, bottom};
    });

    for (const child of element.children) {
      clientRects.push(...getClientRects(child));
    }

    return clientRects;
  }
      function hasTextNodeSiblingsFormingTextBlock(element) {
    if (!element.parentElement) {
      return false;
    }

    const parentElement = element.parentElement;

    const nodeText = element.textContent || '';
    const parentText = parentElement.textContent || '';
    if (parentText.length - nodeText.length < 5) {
    // Parent text mostly consists of this node, so the parent
    // is not a text block container
      return false;
    }

    for (const sibling of element.parentElement.childNodes) {
      if (sibling === element) {
        continue;
      }
      const siblingTextContent = (sibling.textContent || '').trim();
      // Only count text in text nodes so that a series of e.g. buttons isn't counted
      // as a text block.
      // This works reasonably well, but means we miss text blocks where all text is e.g.
      // wrapped in spans
      if (sibling.nodeType === Node.TEXT_NODE && siblingTextContent.length > 0) {
        return true;
      }
    }

    return false;
  }
      function elementIsInTextBlock(element) {
    const {display} = getComputedStyle(element);
    if (display !== 'inline' && display !== 'inline-block') {
      return false;
    }

    if (hasTextNodeSiblingsFormingTextBlock(element)) {
      return true;
    } else if (element.parentElement) {
      return elementIsInTextBlock(element.parentElement);
    } else {
      return false;
    }
  }
      function allClientRectsEmpty(clientRects) {
    return clientRects.every(cr => cr.width === 0 && cr.height === 0);
  }
      function getRectArea(rect) {
    return rect.width * rect.height;
  }
      function getLargestRect(rects) {
    let largestRect = rects[0];
    for (const rect of rects) {
      if (getRectArea(rect) > getRectArea(largestRect)) {
        largestRect = rect;
      }
    }
    return largestRect;
  }
      // todo: consistently to sthString and sth.toString()
      function getRectCenterPoint(rect) {
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }
      
  function rectContains(rect1, rect2) {
    return rect2.top >= rect1.top &&
    rect2.right <= rect1.right &&
    rect2.bottom <= rect1.bottom &&
    rect2.left >= rect1.left;
  }
;
  function getNodePath(node) {
  /** @param {Node} node */
    function getNodeIndex(node) {
      let index = 0;
      let prevNode;
      while (prevNode = node.previousSibling) {
        node = prevNode;
        // skip empty text nodes
        if (node.nodeType === Node.TEXT_NODE && node.textContent &&
        node.textContent.trim().length === 0) continue;
        index++;
      }
      return index;
    }

    const path = [];
    while (node && node.parentNode) {
      const index = getNodeIndex(node);
      path.push([index, node.nodeName]);
      node = node.parentNode;
    }
    path.reverse();
    return path.join(',');
  }
      function getNodeSelector(node) {
  /**
   * @param {Element} node
   */
    function getSelectorPart(node) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        part += '#' + node.id;
      } else if (node.classList.length > 0) {
        part += '.' + node.classList[0];
      }
      return part;
    }

    const parts = [];
    while (parts.length < 4) {
      parts.unshift(getSelectorPart(node));
      if (!node.parentElement) {
        break;
      }
      node = node.parentElement;
      if (node.tagName === 'HTML') {
        break;
      }
    }
    return parts.join(' > ');
  }
      function gatherTapTargets() {
  /** @type {LH.Artifacts.TapTarget[]} */
    const targets = [];

    // Capture element positions relative to the top of the page
    document.documentElement.scrollTop = 0;

    /** @type {Element[]} */
    // @ts-ignore - getElementsInDocument put into scope via stringification
    const tapTargetElements = getElementsInDocument(tapTargetsSelector);


    /** @type {{
    tapTargetElement: Element,
    largestRectCenterPoint: {x: number, y: number},
    visibleClientRects: ClientRect[]
  }[]} */
    const enhancedTapTargets = [];
    tapTargetElements.forEach(tapTargetElement => {
    // Filter out tap targets that are likely to cause false failures:
      if (elementHasAncestorTapTarget(tapTargetElement)) {
      // This is usually intentional, either the tap targets trigger the same action
      // or there's a child with a related action (like a delete button for an item)
        return;
      }
      if (elementIsInTextBlock(tapTargetElement)) {
      // Links inside text blocks cause a lot of failures, and there's also an exception for them
      // in the Web Content Accessibility Guidelines https://www.w3.org/TR/WCAG21/#target-size
        return;
      }
      if (elementIsPositionFixedOrSticky(tapTargetElement)) {
      // Fixed and sticky elements only overlap temporarily at certain scroll positions.
        return;
      }

      const visibleClientRects = getVisibleClientRects(tapTargetElement);
      if (visibleClientRects.length === 0) {
        return;
      }

      const largestRect = getLargestRect(visibleClientRects);
      const largestRectCenterPoint = getRectCenterPoint(largestRect);
      // round so we can can assume whole numbers during in-viewport check
      largestRectCenterPoint.x = Math.round(largestRectCenterPoint.x);
      largestRectCenterPoint.y = Math.round(largestRectCenterPoint.y);

      if (largestRectCenterPoint.x >= window.innerWidth) {
      // we don't scroll sideways, so the center of this tap target is always hidden
        return;
      }

      enhancedTapTargets.push({
        tapTargetElement,
        largestRectCenterPoint,
        visibleClientRects,
      });
    });


    enhancedTapTargets.sort(
    (a, b) => {
      return a.largestRectCenterPoint.y - b.largestRectCenterPoint.y;
    }
    );

    // Disable point events so that tap targets below them don't get
    // detected as non-tappable (they are tappable, just not while the viewport
    // is at the current scroll position)
    const reenableFixedAndStickyElementPointerEvents = disableFixedAndStickyElementPointerEvents();

    let item;
    while (item = enhancedTapTargets.shift()) {
      const {tapTargetElement, largestRectCenterPoint, visibleClientRects} = item;

      // todo: do soething to prevent infinite loop here
      while (!pointIsInViewport(largestRectCenterPoint)) {
        const finalScrollPos = document.documentElement.scrollHeight;
        if (document.documentElement.scrollTop >= finalScrollPos) {
          throw Error('scrolled all the way but not found');
        }
        document.documentElement.scrollTop += window.innerHeight;
      }

      const isTop = elementCenterIsAtZAxisTop(tapTargetElement, largestRectCenterPoint);

      if (isTop) {
        targets.push({
          clientRects: visibleClientRects,
          snippet: truncate(tapTargetElement.outerHTML, 300),
          // @ts-ignore - getNodePath put into scope via stringification
          path: getNodePath(tapTargetElement),
          // @ts-ignore - getNodeSelector put into scope via stringification
          selector: getNodeSelector(tapTargetElement),
          href: /** @type {HTMLAnchorElement} */ (tapTargetElement)['href'] || '',
        });
      }
    }

    reenableFixedAndStickyElementPointerEvents();

    return targets;
  }

      return gatherTapTargets();
})();
