/**
 * sanitise-svg.js — Strip dangerous SVG elements and attributes before DOM injection.
 */

/**
 * Strip potentially dangerous elements and attributes from an SVG string.
 * Removes <script>, <foreignObject>, and all on* event attributes and
 * javascript: attribute values.
 *
 * @param {string} svgSource  Raw SVG source string.
 * @returns {string}  Sanitised SVG serialised back to a string.
 */
export function sanitiseSvg(svgSource) {
  const doc = new DOMParser().parseFromString(svgSource, 'image/svg+xml');
  doc.querySelectorAll('script, foreignObject').forEach(el => el.remove());
  doc.querySelectorAll('*').forEach(el => {
    [...el.attributes]
      .filter(a => /^on/i.test(a.name) || /javascript:/i.test(a.value))
      .forEach(a => el.removeAttribute(a.name));
  });
  return new XMLSerializer().serializeToString(doc);
}
