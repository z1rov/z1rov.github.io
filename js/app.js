// Author: z1rov

var SECTION_COLOR_MAP = {
  'writeups':     '#cc2b2b',
  'analisys':     '#7c3aed',
  'scripting':    '#16a34a',
  'notes':        '#ca8a04',
  'projects':     '#0891b2'
};
var SECTION_LABEL = {
  'analisys':     'Analisys',
  'writeups':     'Writeups',
  'notes':        'Notes',
  'scripting':    'Scripting',
  'projects':     'Projects'
};

var SECTION_FILE = {
  'for-you':  'for-you.json',
  'writeups': 'writeups.json',
  'analisys': 'analisys.json',
  'scripting':'scripting.json',
  'notes':    'notes.json',
  'projects': 'projects.json'
};

var MONTHS   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var SECTIONS = ['for-you', 'all', 'writeups', 'analisys', 'scripting', 'notes', 'projects'];

var PAGE_LIMIT = 12;

var CACHE            = {};
var POSTS_PAGE_CACHE  = {};
var POSTS_INDEX       = null;

var currentSection = 'for-you';
var currentView    = 'grid';
var currentPage    = 1;
var loading        = false;

var container;
var paginator;
var picksContainer;
var tagsCloud;
var btnGrid;
var btnList;
var hamburgerBtn;
var menuPanel;
var menuPanelOverlay;

var TAG_LIMIT = 30;

function isMobile() { return window.innerWidth <= 640; }

function fmtDate(d) {
  var parts = d.split('-');
  var m = parseInt(parts[1], 10) - 1;
  return MONTHS[m] + ' ' + parts[0];
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function forceScrollTop() {
  setTimeout(function() {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, 20);
}

function sectionColor(sec) { return SECTION_COLOR_MAP[sec] || '#e11d48'; }

function buildTint(sec) {
  var hex = SECTION_COLOR_MAP[sec];
  if (!hex) return 'rgba(10,10,10,0.78)';
  var r = parseInt(hex.slice(1,3), 16);
  var g = parseInt(hex.slice(3,5), 16);
  var b = parseInt(hex.slice(5,7), 16);
  var f = 0.14;
  return 'rgba(' + Math.round(r*f) + ',' + Math.round(g*f) + ',' + Math.round(b*f) + ',0.14)';
}

function getRootPrefix() {
  var depth = (window.location.pathname.match(/\//g) || []).length - 1;
  return depth > 0 ? '../'.repeat(depth) : '';
}

var iconWords = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>';
var iconTime  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';

var ICONS = {
  'windows': '<svg viewBox="0 0 24 24" fill="none"><path fill="currentColor" d="M3,12V6.75L9,5.43v6.48L3,12M20,3v8.75L10,11.9V5.21L20,3M3,13l6,.09V19.9L3,18.75V13m17,.25V22L10,20.09v-7Z"/></svg>',

  'linux': '<svg viewBox="0 0 24 24" fill="none"><g transform="scale(0.5)"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M16.2182 35.9c-3.1368 0-6.8982 1.496-7.2988 5.6766a.916.916 0 0 0 .9061 1.0025h11.97A.9.9 0 0 0 22.7 41.643C22.6175 39.8048 21.7865 35.9 16.2182 35.9Z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M18.0508 20.564c-1.35 1.0368-7.3687 7.51-4.3595 15.6667"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M31.7818 35.9c3.1368 0 6.8982 1.496 7.2988 5.6766a.916.916 0 0 1-.9061 1.0025h-11.97A.9.9 0 0 1 25.3 41.643C25.3825 39.8048 26.2135 35.9 31.7818 35.9Z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M35.0148 36.4556c3.1848-2.8438 2.7468-7.5246 2.7468-8.7785 2.8935.82 5.0306 2.9709 5.5941 2.17 1.3744-1.9531-7.5193-7.5461-7.6918-10.8989C35.4951 15.6692 35.1706 5.4214 24 5.4214S12.5049 15.6692 12.3361 18.9484c-.1725 3.3528-9.0662 8.9458-7.6918 10.8989.5635.8007 2.7006-1.35 5.5941-2.17 0 1.2539-.438 5.9347 2.7468 8.7785"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M29.2763 19.8324c1.9318 1.5032 8.0416 8.242 5.0324 16.3983"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M24 24.8431l3.9479-4.2791c-.3858-1.0127-1.712-1.929-3.9479-1.929s-3.5621.9163-3.9479 1.929Z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M20.0521 20.564c-3.424.5063-3.9062-2.7247-3.9062-4.7019 0-2.7006 1.4467-4.4367 3.9062-4.4367S23.79 14.7529 23.79 16.3443A3.8486 3.8486 0 0 1 23.181 18.68"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M27.7205 20.1334c.6751.0482 3.9538-.3892 3.9538-3.331s-1.76-3.7615-4.1232-3.7615a3.7861 3.7861 0 0 0-3.8164 2.6682"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M22.7012 41.4815a6.8371 6.8371 0 0 0 2.6076 0"/><circle fill="currentColor" cx="22.1579" cy="16.5888" r="0.75"/><circle fill="currentColor" cx="25.5497" cy="16.5888" r="0.75"/></g></svg>',

  'analisys': '<svg viewBox="0 0 512.014 512.014" fill="none"><path fill="currentColor" d="M509.087,351.889l-36.907-62.912l-58.475-14.613c-1.536-20.139-4.651-37.803-8.747-53.12l30.336-29.248h34.048c11.776,0,21.333-9.536,21.333-21.333c0-11.776-9.557-21.333-21.333-21.333h-51.285l-29.547,28.501c-7.531-14.635-15.381-25.493-21.739-32.725c-0.341-0.384-0.768-0.704-1.109-1.067c-2.347-16.875-10.752-34.219-25.088-51.819l36.587-33.899c8.661-8,9.173-21.504,1.152-30.144c-8-8.661-21.525-9.152-30.144-1.152l-38.72,35.883c-30.741-18.56-71.893-12.096-95.979-0.619L187.38,29.414c-7.317-9.259-20.757-10.773-29.973-3.456c-9.216,7.339-10.773,20.736-3.435,29.973l27.264,34.368c-14.976,17.92-23.915,35.691-26.539,53.504c-0.448,0.448-0.981,0.832-1.387,1.323c-6.635,7.573-14.933,18.901-22.763,34.581l-37.675-30.379H42.676c-11.776,0-21.333,9.557-21.333,21.333c0,11.797,9.557,21.333,21.333,21.333h35.136l37.12,29.931c-3.883,14.699-6.933,31.36-8.469,50.389l-66.624,16.661L2.932,351.889c-5.952,10.155-2.56,23.211,7.616,29.184c3.392,2.005,7.104,2.923,10.773,2.923c7.317,0,14.443-3.755,18.432-10.539l27.819-47.445l38.635-9.643c1.92,14.997,7.488,40.064,23.253,69.547l-44.416,19.029l-19.2,57.664c-3.733,11.157,2.325,23.232,13.504,26.965c2.219,0.747,4.501,1.109,6.72,1.109c8.939,0,17.28-5.653,20.245-14.613l13.141-39.445l33.579-14.4c7.253,9.387,15.552,18.944,25.173,28.565l10.176,10.176c19.136,19.157,44.587,29.696,71.659,29.696c27.093,0,52.544-10.539,71.701-29.696l10.155-10.176c9.344-9.344,17.451-18.645,24.576-27.797l25.835,12.928l13.376,40.149c2.987,8.96,11.307,14.613,20.245,14.613c2.24,0,4.523-0.363,6.741-1.109c11.179-3.733,17.237-15.808,13.504-26.965L427.21,405.67l-37.163-18.581c15.552-28.736,21.419-53.376,23.595-68.779l30.805,7.701l27.819,47.445c3.989,6.784,11.115,10.539,18.432,10.539c3.669,0,7.381-0.939,10.773-2.923C511.626,375.099,515.039,362.043,509.087,351.889z M323.743,152.081c-0.619,5.077-3.179,20.181-12.203,34.133c-0.128,0.192-0.256,0.384-0.384,0.576c-2.133,3.243-4.672,6.379-7.595,9.344c-0.32,0.32-0.683,0.64-1.003,0.96c-2.944,2.837-6.272,5.44-10.048,7.723c-0.469,0.277-0.981,0.512-1.451,0.768c-3.925,2.197-8.277,4.075-13.205,5.376c-0.427,0.128-0.896,0.171-1.323,0.277c-5.248,1.28-10.944,2.091-17.387,2.091c-6.037,0-11.349-0.747-16.277-1.856c-0.683-0.149-1.429-0.235-2.112-0.405c-4.203-1.088-7.893-2.667-11.349-4.416c-1.109-0.576-2.261-1.088-3.285-1.707c-2.859-1.707-5.376-3.648-7.701-5.696c-1.131-1.003-2.24-2.005-3.264-3.051c-1.963-2.048-3.755-4.203-5.333-6.421c-0.832-1.131-1.579-2.261-2.283-3.413c-1.536-2.475-2.965-4.992-4.096-7.509c-0.299-0.619-0.555-1.237-0.832-1.856c-3.989-9.493-5.547-18.432-6.101-23.68c0.213-13.675,11.328-31.552,31.403-50.432c3.968-3.413,20.16-9.131,36.352-9.131c10.325,0,20.672,2.325,27.84,9.067c20.352,19.136,31.573,37.205,31.659,49.024L323.743,152.081z"/></svg>',

  'scripting': '<svg viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-width="1.5" d="M13 2.5V5C13 7.35702 13 8.53553 13.7322 9.26777C14.4645 10 15.643 10 18 10H22"/><path stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M7 14L6 15L7 16M11.5 16L12.5 17L11.5 18M10 14L8.5 18"/><path fill="currentColor" d="M2.75 10C2.75 9.58579 2.41421 9.25 2 9.25C1.58579 9.25 1.25 9.58579 1.25 10H2.75ZM21.25 14C21.25 14.4142 21.5858 14.75 22 14.75C22.4142 14.75 22.75 14.4142 22.75 14H21.25ZM15.3929 4.05365L14.8912 4.61112L15.3929 4.05365ZM19.3517 7.61654L18.85 8.17402L19.3517 7.61654ZM21.654 10.1541L20.9689 10.4592V10.4592L21.654 10.1541ZM3.17157 20.8284L3.7019 20.2981H3.7019L3.17157 20.8284ZM20.8284 20.8284L20.2981 20.2981L20.2981 20.2981L20.8284 20.8284ZM1.35509 5.92658C1.31455 6.33881 1.61585 6.70585 2.02807 6.7464C2.4403 6.78695 2.80734 6.48564 2.84789 6.07342L1.35509 5.92658ZM22.6449 18.0734C22.6855 17.6612 22.3841 17.2941 21.9719 17.2536C21.5597 17.2131 21.1927 17.5144 21.1521 17.9266L22.6449 18.0734ZM14 21.25H10V22.75H14V21.25ZM2.75 14V10H1.25V14H2.75ZM21.25 13.5629V14H22.75V13.5629H21.25ZM14.8912 4.61112L18.85 8.17402L19.8534 7.05907L15.8947 3.49618L14.8912 4.61112ZM22.75 13.5629C22.75 11.8745 22.7651 10.8055 22.3391 9.84897L20.9689 10.4592C21.2349 11.0565 21.25 11.742 21.25 13.5629H22.75ZM18.85 8.17402C20.2034 9.3921 20.7029 9.86199 20.9689 10.4592L22.3391 9.84897C21.9131 8.89241 21.1084 8.18853 19.8534 7.05907L18.85 8.17402ZM10.0298 2.75C11.6116 2.75 12.2085 2.76158 12.7405 2.96573L13.2779 1.5653C12.4261 1.23842 11.498 1.25 10.0298 1.25V2.75ZM15.8947 3.49618C14.8087 2.51878 14.1297 1.89214 13.2779 1.5653L12.7405 2.96573C13.2727 3.16993 13.7215 3.55836 14.8912 4.61112L15.8947 3.49618ZM10 21.25C8.09318 21.25 6.73851 21.2484 5.71085 21.1102C4.70476 20.975 4.12511 20.7213 3.7019 20.2981L2.64124 21.3588C3.38961 22.1071 4.33855 22.4392 5.51098 22.5969C6.66182 22.7516 8.13558 22.75 10 22.75V21.25ZM1.25 14C1.25 15.8644 1.24841 17.3382 1.40313 18.489C1.56076 19.6614 1.89288 20.6104 2.64124 21.3588L3.7019 20.2981C3.27869 19.8749 3.02502 19.2952 2.88976 18.2892C2.75159 17.2615 2.75 15.9068 2.75 14H1.25ZM14 22.75C15.8644 22.75 17.3382 22.7516 18.489 22.5969C19.6614 22.4392 20.6104 22.1071 21.3588 21.3588L20.2981 20.2981C19.8749 20.7213 19.2952 20.975 18.2892 21.1102C17.2615 21.2484 15.9068 21.25 14 21.25V22.75ZM10.0298 1.25C8.15538 1.25 6.67442 1.24842 5.51887 1.40307C4.34232 1.56054 3.39019 1.8923 2.64124 2.64124L3.7019 3.7019C4.12453 3.27928 4.70596 3.02525 5.71785 2.88982C6.75075 2.75158 8.11311 2.75 10.0298 2.75V1.25ZM2.84789 6.07342C2.96931 4.83905 3.23045 4.17335 3.7019 3.7019L2.64124 2.64124C1.80633 3.47616 1.48944 4.56072 1.35509 5.92658L2.84789 6.07342ZM21.1521 17.9266C21.0307 19.1609 20.7695 19.8266 20.2981 20.2981L21.3588 21.3588C22.1937 20.5238 22.5106 19.4393 22.6449 18.0734L21.1521 17.9266Z"/></svg>',

  'network': '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="5" r="2.5" stroke="currentColor" stroke-width="2"/><circle cx="5" cy="18" r="2.5" stroke="currentColor" stroke-width="2"/><circle cx="19" cy="18" r="2.5" stroke="currentColor" stroke-width="2"/><path d="M10.8 7.1L6.2 15.9M13.2 7.1l4.6 8.8M7.5 18h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',

  'challenge': '<svg width="25" height="25" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" class="htb-icon" aria-label="tactic"><path d="M14.75 15.8125L14.0833 16.4792C13.9306 16.6319 13.7523 16.7083 13.5486 16.7083C13.3449 16.7083 13.169 16.6319 13.0208 16.4792C12.8681 16.3264 12.7917 16.1493 12.7917 15.9479C12.7917 15.7465 12.8681 15.5694 13.0208 15.4167L13.6875 14.75L13.0208 14.0833C12.8681 13.9306 12.7917 13.7523 12.7917 13.5486C12.7917 13.3449 12.8681 13.169 13.0208 13.0208C13.169 12.8681 13.3449 12.7917 13.5486 12.7917C13.7523 12.7917 13.9304 12.8679 14.0829 13.0204L14.75 13.6875L15.4167 13.0208C15.5694 12.8681 15.7477 12.7917 15.9514 12.7917C16.1551 12.7917 16.331 12.8681 16.4792 13.0208C16.6319 13.169 16.7083 13.3449 16.7083 13.5486C16.7083 13.7523 16.6321 13.9304 16.4796 14.0829L15.8125 14.75L16.4844 15.4219C16.6337 15.5712 16.7083 15.7465 16.7083 15.9479C16.7083 16.1493 16.6319 16.3297 16.4792 16.4891C16.3264 16.6353 16.1493 16.7083 15.9479 16.7083C15.7465 16.7083 15.5696 16.6321 15.4171 16.4796L14.75 15.8125ZM5.5 15.5C5.78333 15.5 6.02083 15.4042 6.2125 15.2125C6.40417 15.0208 6.5 14.7833 6.5 14.5C6.5 14.2167 6.40417 13.9792 6.2125 13.7875C6.02083 13.5958 5.78333 13.5 5.5 13.5C5.21667 13.5 4.97917 13.5958 4.7875 13.7875C4.59583 13.9792 4.5 14.2167 4.5 14.5C4.5 14.7833 4.59583 15.0208 4.7875 15.2125C4.97917 15.4042 5.21667 15.5 5.5 15.5ZM5.5 17C4.80556 17 4.21528 16.7569 3.72917 16.2708C3.24306 15.7847 3 15.1944 3 14.5C3 13.8056 3.24306 13.2153 3.72917 12.7292C4.21528 12.2431 4.80556 12 5.5 12C6.00864 12 6.4726 12.1424 6.8919 12.4271C7.31119 12.7118 7.61806 13.0903 7.8125 13.5625C8.24306 13.4097 8.59028 13.1424 8.85417 12.7604C9.11806 12.3785 9.25 11.9583 9.25 11.5V8.25C9.25 7.2125 9.61563 6.32813 10.3469 5.59688C11.0781 4.86563 11.9625 4.5 13 4.5H14.0417L13.2083 3.64583C13.0556 3.49306 12.9792 3.30903 12.9792 3.09375C12.9792 2.87847 13.0552 2.69444 13.2072 2.54167C13.3593 2.38889 13.5398 2.3125 13.7489 2.3125C13.958 2.3125 14.1389 2.38889 14.2917 2.54167L16.4792 4.72917C16.6319 4.87689 16.7083 5.04924 16.7083 5.24621C16.7083 5.44318 16.6319 5.61806 16.4792 5.77083L14.2937 7.95633C14.1396 8.11044 13.9583 8.1875 13.75 8.1875C13.5417 8.1875 13.3611 8.10779 13.2083 7.94837C13.0556 7.80224 12.9792 7.62138 12.9792 7.40579C12.9792 7.19022 13.0556 7.00635 13.2083 6.85417L14.0417 6H13C12.375 6 11.8438 6.21875 11.4062 6.65625C10.9688 7.09375 10.75 7.625 10.75 8.25V11.5C10.75 12.3611 10.4861 13.1285 9.95833 13.8021C9.43056 14.4757 8.75 14.91 7.91667 15.105C7.77778 15.66 7.48611 16.1146 7.04167 16.4688C6.59722 16.8229 6.08333 17 5.5 17ZM5.25 6.3125L4.58333 6.97917C4.43056 7.13194 4.25231 7.20833 4.0486 7.20833C3.84491 7.20833 3.66899 7.13194 3.52083 6.97917C3.36806 6.82639 3.29167 6.64931 3.29167 6.44792C3.29167 6.24653 3.36806 6.06944 3.52083 5.91667L4.1875 5.25L3.52083 4.58333C3.36806 4.43056 3.29167 4.25231 3.29167 4.0486C3.29167 3.84491 3.36806 3.66899 3.52083 3.52083C3.66899 3.36806 3.84491 3.29167 4.0486 3.29167C4.25231 3.29167 4.43041 3.36791 4.5829 3.5204L5.25 4.1875L5.91667 3.52083C6.06944 3.36806 6.24769 3.29167 6.4514 3.29167C6.65509 3.29167 6.83101 3.36806 6.97917 3.52083C7.13194 3.66899 7.20833 3.84491 7.20833 4.0486C7.20833 4.25231 7.13209 4.43041 6.9796 4.5829L6.3125 5.25L6.98438 5.92188C7.13368 6.07118 7.20833 6.24653 7.20833 6.44792C7.20833 6.64931 7.13194 6.82971 6.97917 6.98913C6.82639 7.13526 6.64931 7.20833 6.44792 7.20833C6.24653 7.20833 6.06959 7.13209 5.9171 6.9796L5.25 6.3125Z" fill="currentColor"/></svg>',

  'sherlocks': '<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.5L20 5.5V11.2C20 16.1 16.9 19.8 12 21.5C7.1 19.8 4 16.1 4 11.2V5.5L12 2.5Z" fill="#94A3B8"/><path d="M12 7.3C10.75 7.3 9.75 8.25 9.75 9.45C9.75 10.25 10.2 10.9 10.85 11.25L10.25 15H13.75L13.15 11.25C13.8 10.9 14.25 10.25 14.25 9.45C14.25 8.25 13.25 7.3 12 7.3Z" fill="#172235"/></svg>',

  'projects': '<svg viewBox="0 0 24 24" fill="none"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',

  'default': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>'
};

var SECTION_ICON_DEFAULT = {
  'analisys':  'analisys',
  'scripting': 'scripting',
  'projects':  'projects'
};

function getPostIcon(p) {
  if (p.icon && ICONS[p.icon]) return ICONS[p.icon];
  var secFallback = SECTION_ICON_DEFAULT[p.section];
  if (secFallback && ICONS[secFallback]) return ICONS[secFallback];
  return ICONS.default;
}

function buildStats(context) {
  var cls = context === 'grid' ? 'pg-stat' : 'pl-stat';
  var dot = context === 'grid' ? '<span class="pg-dot"></span>' : '<span class="pl-dot"></span>';
  return (
    '<span class="' + cls + ' stat-words">' + iconWords + '<span>— w</span></span>' +
    dot +
    '<span class="' + cls + ' stat-time">' + iconTime + '<span>? min</span></span>'
  );
}

function updateCardStats(card, data) {
  if (!data) return;
  var wordSpan = card.querySelector('.stat-words span');
  var timeSpan = card.querySelector('.stat-time span');
  if (wordSpan) wordSpan.textContent = data.words     ? data.words.toLocaleString() + ' w' : '— w';
  if (timeSpan) timeSpan.textContent = data.timeLabel ? data.timeLabel + ' read'            : '? min';
}

function buildTagBadges(tags, sec) {
  if (!Array.isArray(tags) || tags.length === 0) return '';
  var html = '<div class="card-tags">';
  tags.forEach(function(t) {
    html += '<span class="card-tag">' + t + '</span>';
  });
  html += '</div>';
  return html;
}

function buildIconBox(p) {
  return '<div class="card-icon-box">' + getPostIcon(p) + '</div>';
}

async function loadSection(sec) {
  if (CACHE[sec]) return CACHE[sec];

  var file = SECTION_FILE[sec];
  if (!file) { CACHE[sec] = []; return []; }

  var url = getRootPrefix() + 'data/' + file + '?v=' + Date.now();
  try {
    var res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) { CACHE[sec] = []; return []; }
    var data = await res.json();
    CACHE[sec] = Array.isArray(data) ? data : [];
    return CACHE[sec];
  } catch (err) {
    CACHE[sec] = [];
    return [];
  }
}

async function loadPostsIndex() {
  if (POSTS_INDEX) return POSTS_INDEX;

  var url = getRootPrefix() + 'data/posts-index.json?v=' + Date.now();
  try {
    var res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    POSTS_INDEX = {
      total_posts:    data.total_posts    || 0,
      posts_per_page: data.posts_per_page || PAGE_LIMIT,
      total_pages:    data.total_pages    || 1
    };
    return POSTS_INDEX;
  } catch (err) {
    POSTS_INDEX = { total_posts: 0, posts_per_page: PAGE_LIMIT, total_pages: 1 };
    return POSTS_INDEX;
  }
}

async function loadPostsPage(page) {
  if (POSTS_PAGE_CACHE[page] !== undefined) {
    return POSTS_PAGE_CACHE[page];
  }

  var url = getRootPrefix() + 'data/post/post-' + page + '.json?v=' + Date.now();
  try {
    var res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    var posts = Array.isArray(data) ? data : [];
    POSTS_PAGE_CACHE[page] = posts;
    return posts;
  } catch (err) {
    POSTS_PAGE_CACHE[page] = [];
    return [];
  }
}

async function loadSidebarPosts() {
  if (CACHE['_sidebar']) return CACHE['_sidebar'];

  var url = getRootPrefix() + 'data/posts-recent.json?v=' + Date.now();
  try {
    var res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    CACHE['_sidebar'] = Array.isArray(data) ? data : [];
    return CACHE['_sidebar'];
  } catch (err) {
    CACHE['_sidebar'] = CACHE['for-you'] || [];
    return CACHE['_sidebar'];
  }
}

function renderGrid(posts) {
  var grid = document.createElement('div');
  grid.className = 'posts-grid';
  if (posts.length === 1) grid.classList.add('cards-1');
  if (posts.length === 2) grid.classList.add('cards-2');

  posts.forEach(function(p) {
    var color = sectionColor(p.section);
    var label = capitalize(p.section);
    var card  = document.createElement('article');
    card.className = 'pg-card';

    card.style.setProperty('--section-color', color);

    card.innerHTML =
      '<div class="pg-body">' +
        '<div class="pg-cat" style="color:' + color + ';--cat-dot:' + color + '">' + label + '</div>' +
        '<div class="pg-title">' + p.title + '</div>' +
        '<div class="pg-desc">'  + p.description + '</div>' +
        buildTagBadges(p.tags, p.section) +
        '<div class="pg-footer">' + buildStats('grid') + '</div>' +
      '</div>' +
      '<div class="pg-visual">' + buildIconBox(p) + '</div>';

    card.addEventListener('click', (function(href) {
      return function() { window.location.href = href; };
    })(p.permalink));

    grid.appendChild(card);
    updateCardStats(card, { words: p.words || null, timeLabel: p.readTime || null });
  });

  return grid;
}

function renderList(posts) {
  var list = document.createElement('div');
  list.className = 'posts-list';

  posts.forEach(function(p) {
    var color = sectionColor(p.section);
    var label = capitalize(p.section);
    var item  = document.createElement('div');
    item.className = 'pl-item';

    item.style.setProperty('--section-color', color);

    item.innerHTML =
      '<div class="pl-body">' +
        '<div class="pl-meta">' +
          '<span class="pl-cat" style="color:' + color + ';--dot-c:' + color + '">' + label + '</span>' +
          '<span class="pl-date">' + fmtDate(p.date) + '</span>' +
        '</div>' +
        '<div class="pl-title">' + p.title + '</div>' +
        '<div class="pl-desc">'  + p.description + '</div>' +
        buildTagBadges(p.tags, p.section) +
        '<div class="pl-foot">'  + buildStats('list') + '</div>' +
      '</div>' +
      '<div class="pl-visual">' + buildIconBox(p) + '</div>';

    item.addEventListener('click', (function(href) {
      return function() { window.location.href = href; };
    })(p.permalink));

    list.appendChild(item);
    updateCardStats(item, { words: p.words || null, timeLabel: p.readTime || null });
  });

  return list;
}

var PICK_TINTS = ['pt1', 'pt2', 'pt3'];

function renderPicks(posts) {
  if (!picksContainer) return;
  var picks = posts.filter(function(p) { return p.pick === 1; }).slice(0, 3);
  picksContainer.innerHTML = '';

  picks.forEach(function(p, i) {
    var sectionLabel = capitalize(p.section);
    var color        = sectionColor(p.section);

    if (i > 0) {
      var sep = document.createElement('div');
      sep.className = 'pick-sep';
      picksContainer.appendChild(sep);
    }

    var li = document.createElement('li');
    li.className = 'pick';

    li.style.setProperty('--section-color', color);

    li.innerHTML =
      '<span class="pick-num">0' + (i + 1) + '</span>' +
      '<div class="pick-thumb ' + PICK_TINTS[i] + '"></div>' +
      '<div class="pick-info">' +
        '<span class="pick-title">' + p.title + '</span>' +
        '<span class="pick-sub">' + p.description.slice(0, 85) + '…</span>' +
        '<div class="pick-meta">' +
          '<span class="tag tag-xs" style="color:' + color + ';border-color:' + color + '44;background:' + color + '12">' + sectionLabel + '</span>' +
        '</div>' +
      '</div>';

    li.addEventListener('click', (function(href) {
      return function() { window.location.href = href; };
    })(p.permalink));

    picksContainer.appendChild(li);
  });
}

function renderTags(posts) {
  if (!tagsCloud) return;
  var seen = {};
  var tags = [];
  posts.forEach(function(p) {
    if (Array.isArray(p.tags)) {
      p.tags.forEach(function(t) {
        var clean = t.toLowerCase().trim();
        if (clean && !seen[clean]) { seen[clean] = true; tags.push(clean); }
      });
    }
  });

  tags = tags.slice(0, TAG_LIMIT);
  tagsCloud.innerHTML = '';
  tags.forEach(function(t) {
    var a = document.createElement('a');
    a.className = 'tag';
    a.textContent = t;
    a.href = 'page/tags.html#' + encodeURIComponent(t);
    tagsCloud.appendChild(a);
  });
}

function renderPaginator(totalPages, cur) {
  paginator.innerHTML = '';
  if (totalPages <= 1) return;

  var svgFirst = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>';
  var svgPrev  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>';
  var svgNext  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>';
  var svgLast  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>';

  function mkBtn(html, disabled, targetPg) {
    var b = document.createElement('button');
    b.className = 'pg-btn';
    b.innerHTML = html;
    if (disabled) {
      b.disabled = true;
    } else {
      b.addEventListener('click', (function(pg) {
        return function() { goPage(pg); };
      })(targetPg));
    }
    return b;
  }

  paginator.appendChild(mkBtn(svgFirst, cur === 1,          1));
  paginator.appendChild(mkBtn(svgPrev,  cur === 1,          cur - 1));
  var badge = document.createElement('span');
  badge.className = 'pg-current';
  badge.textContent = cur;
  paginator.appendChild(badge);
  paginator.appendChild(mkBtn(svgNext, cur === totalPages, cur + 1));
  paginator.appendChild(mkBtn(svgLast, cur === totalPages, totalPages));
}

function goPage(p) {
  currentPage = p;
  renderWithLoader();
  forceScrollTop();
}

function showLoader() {
  if (!container) return;
  container.innerHTML =
    '<div style="padding:48px;text-align:center;font-family:var(--mono);' +
    'font-size:0.62rem;letter-spacing:0.1em;color:var(--text-3)">LOADING…</div>';
  if (paginator) paginator.innerHTML = '';
}

async function render(posts, totalPages) {
  if (!container) return;

  var v = isMobile() ? 'list' : currentView;

  if (currentSection === 'for-you') {
    container.innerHTML = '';
    container.appendChild(v === 'grid' ? renderGrid(posts) : renderList(posts));
    if (paginator) paginator.innerHTML = '';
    return;
  }

  if (currentSection === 'all') {
    container.innerHTML = '';
    container.appendChild(v === 'grid' ? renderGrid(posts) : renderList(posts));
    renderPaginator(totalPages || 1, currentPage);
    return;
  }

  var total = Math.max(1, Math.ceil(posts.length / PAGE_LIMIT));
  if (currentPage < 1)     currentPage = 1;
  if (currentPage > total) currentPage = total;

  var slice = posts.slice((currentPage - 1) * PAGE_LIMIT, currentPage * PAGE_LIMIT);
  container.innerHTML = '';
  container.appendChild(v === 'grid' ? renderGrid(slice) : renderList(slice));
  renderPaginator(total, currentPage);
}

async function renderWithLoader() {
  if (!container || loading) return;
  loading = true;
  showLoader();

  try {
    if (currentSection === 'all') {
      var idx = await loadPostsIndex();

      if (currentPage < 1)               currentPage = 1;
      if (currentPage > idx.total_pages) currentPage = idx.total_pages;

      var posts = await loadPostsPage(currentPage);
      await render(posts, idx.total_pages);

    } else {
      var sectionPosts = await loadSection(currentSection);
      await render(sectionPosts);
    }

    var sidebarPosts = await loadSidebarPosts();
    renderPicks(sidebarPosts);
    renderTags(sidebarPosts);

  } catch (err) {
    container.innerHTML =
      '<p style="color:var(--text-3);padding:32px;font-family:var(--mono);font-size:0.65rem;letter-spacing:0.08em;">' +
      'FAILED TO LOAD POSTS</p>';
  }

  loading = false;
}

function setSection(sec) {
  if (SECTIONS.indexOf(sec) === -1) sec = 'for-you';
  currentSection = sec;
  currentPage    = 1;
  document.querySelectorAll('[data-section]').forEach(function(el) {
    el.classList.toggle('active', el.dataset.section === sec);
  });
  renderWithLoader();
}

function handleHash() {
  var hash = window.location.hash.replace('#', '');
  setSection(SECTIONS.indexOf(hash) !== -1 ? hash : 'for-you');
}

function openMenuPanel() {
  if (!menuPanel || !menuPanelOverlay) return;
  menuPanel.classList.add('open');
  menuPanelOverlay.classList.add('open');
  if (hamburgerBtn) hamburgerBtn.setAttribute('aria-expanded', 'true');
}

function closeMenuPanel() {
  if (!menuPanel || !menuPanelOverlay) return;
  menuPanel.classList.remove('open');
  menuPanelOverlay.classList.remove('open');
  if (hamburgerBtn) hamburgerBtn.setAttribute('aria-expanded', 'false');
}

document.addEventListener('DOMContentLoaded', function() {

  container        = document.getElementById('postsContainer');
  paginator        = document.getElementById('paginator');
  picksContainer   = document.getElementById('picksContainer');
  tagsCloud        = document.getElementById('tagsCloud');
  btnGrid          = document.getElementById('btnGrid');
  btnList          = document.getElementById('btnList');
  hamburgerBtn     = document.getElementById('hamburgerBtn');
  menuPanel        = document.getElementById('menuPanel');
  menuPanelOverlay = document.getElementById('menuPanelOverlay');

  var htmlEl   = document.documentElement;
  var themeBtn = document.getElementById('themeBtn');
  var savedTheme = localStorage.getItem('zfx-theme');
  if (savedTheme) htmlEl.setAttribute('data-theme', savedTheme);

  function applyTheme(t) {
    htmlEl.setAttribute('data-theme', t);
    localStorage.setItem('zfx-theme', t);
  }
  applyTheme(htmlEl.getAttribute('data-theme') || 'dark');

  if (themeBtn) themeBtn.addEventListener('click', function() {
    applyTheme(htmlEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  if (hamburgerBtn) hamburgerBtn.addEventListener('click', function() {
    if (menuPanel && menuPanel.classList.contains('open')) {
      closeMenuPanel();
    } else {
      openMenuPanel();
    }
  });
  if (menuPanelOverlay) menuPanelOverlay.addEventListener('click', closeMenuPanel);
  if (menuPanel) {
    menuPanel.querySelectorAll('.menu-panel-link').forEach(function(link) {
      link.addEventListener('click', closeMenuPanel);
    });
  }

  if (!container) return;

  if (btnGrid) btnGrid.addEventListener('click', function() {
    currentView = 'grid'; currentPage = 1;
    btnGrid.classList.add('active'); btnList.classList.remove('active');
    if (currentSection === 'all') {
      var cached = POSTS_PAGE_CACHE[currentPage];
      var totalPg = POSTS_INDEX ? POSTS_INDEX.total_pages : 1;
      if (cached !== undefined) render(cached, totalPg);
    } else {
      var flatCached = CACHE[currentSection];
      if (flatCached) render(flatCached);
    }
  });
  if (btnList) btnList.addEventListener('click', function() {
    currentView = 'list'; currentPage = 1;
    btnList.classList.add('active'); btnGrid.classList.remove('active');
    if (currentSection === 'all') {
      var cached = POSTS_PAGE_CACHE[currentPage];
      var totalPg = POSTS_INDEX ? POSTS_INDEX.total_pages : 1;
      if (cached !== undefined) render(cached, totalPg);
    } else {
      var flatCached = CACHE[currentSection];
      if (flatCached) render(flatCached);
    }
  });

  window.addEventListener('hashchange', handleHash);

  document.querySelectorAll('[data-section]').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.preventDefault();
      history.pushState(null, '', '#' + el.dataset.section);
      setSection(el.dataset.section);
      forceScrollTop();
      closeMenuPanel();
    });
  });

  document.querySelectorAll('.footer-link').forEach(function(el) {
    el.addEventListener('click', function(e) {
      var sec = (el.getAttribute('href') || '').replace('#', '');
      if (SECTIONS.indexOf(sec) !== -1) {
        e.preventDefault();
        history.pushState(null, '', '#' + sec);
        setSection(sec);
        forceScrollTop();
      }
    });
  });

  var rt;
  window.addEventListener('resize', function() {
    if (window.innerWidth > 760) closeMenuPanel();
    clearTimeout(rt);
    rt = setTimeout(function() {
      if (currentSection === 'all') {
        var cached = POSTS_PAGE_CACHE[currentPage];
        var totalPg = POSTS_INDEX ? POSTS_INDEX.total_pages : 1;
        if (cached !== undefined) render(cached, totalPg);
      } else {
        var flatCached = CACHE[currentSection];
        if (flatCached) render(flatCached);
      }
    }, 120);
  });

  (async function boot() {
    if (!container) return;
    showLoader();
    try {
      await Promise.all([
        loadSection('for-you'),
        loadPostsIndex(),
        loadSidebarPosts()
      ]);

      var sidebarPosts = CACHE['_sidebar'] || [];
      renderPicks(sidebarPosts);
      renderTags(sidebarPosts);

      handleHash();

    } catch (err) {
      if (container) {
        container.innerHTML =
          '<p style="color:var(--text-3);padding:32px;font-family:var(--mono);font-size:0.65rem;letter-spacing:0.08em;">' +
          'FAILED TO LOAD POSTS</p>';
      }
    }
  })();

});