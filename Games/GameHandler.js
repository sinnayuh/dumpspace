//gets the params of the url, expects to be a full valid url, example.com/?param=abc
//if the url is empty, it will use the current window.location.search
function getUrlParams(url) {
  var params = {}; // Create an empty object to store the parameters

  // Get the URL query string
  var queryString = null;

  //remove the ugly ?
  if (url == null) {
    queryString = window.location.search.substring(1);
  } else queryString = url.substring(1);

  // Split the query string into individual parameters
  var paramArray = queryString.split("&");

  // Iterate through the parameter array
  for (var i = 0; i < paramArray.length; i++) {
    var param = paramArray[i].split("=");
    var paramName = decodeURIComponent(param[0]);
    try {
      var paramValue = decodeURIComponent(param[1]);
      // Store the parameter in the 'params' object
      params[paramName] = paramValue;
    } catch (err) {
      params[paramName] = "";
    }
  }

  //return the params
  return params;
}

//current URL params and stored in a global var
var UrlParams = getUrlParams();
var currentURL = window.location.href;

//sets a valid url with params for the target game
function getGameInfo(info, reload = true, newWindow = false, push = true) {
  //no url params? thats weird
  if (Object.keys(UrlParams).length == 0) return;

  //the first param always has to be the game hash
  if (Object.keys(UrlParams)[0] != "hash") return;
  var newURL = window.location.origin + window.location.pathname + "?";

  // no matter what, reset the url params
  newURL += "hash=" + UrlParams["hash"] + "&type=" + info;

  if (UrlParams["sha"]) newURL += "&sha=" + UrlParams["sha"];
  // Carry the diff comparison across tab switches so the user doesn't have
  // to re-trigger it from the history modal each time.
  if (UrlParams["diff"]) newURL += "&diff=" + UrlParams["diff"];

  if (newWindow) {
    window.open(newURL, "_blank");
  } else {
    if (push) {
      console.log("[getGameInfo] pushing state " + newURL);
      history.pushState(null, null, newURL);
    } else {
      console.log(
        "[getGameInfo] replacing state " + currentURL + " with " + newURL,
      );
      history.replaceState(null, null, newURL);
    }
    currentURL = newURL;

    if (reload) location.reload();

    //fetch the new url params
    UrlParams = getUrlParams();
  }
}

//reloads the website with the CName and its type (C,S,F,E)
//only call if the current type does not match the new type
async function reloadWithNewCName(CName, newType, member, newWindow = false) {
  //params always need hash and current type
  if (Object.keys(UrlParams).length < 2) return;

  //no hash?
  if (Object.keys(UrlParams)[0] != "hash") return;

  //not supported type param?
  if (
    Object.keys(UrlParams)[1] != "type" ||
    (UrlParams["type"] != "classes" &&
      UrlParams["type"] != "structs" &&
      UrlParams["type"] != "functions" &&
      UrlParams["type"] != "enums")
  )
    return;

  if (newType == null) return;

  //remove pointers
  if (CName.charAt(CName.length - 1) === "*") {
    CName = CName.slice(0, -1);
  }

  //before reload/redirect to a new window, fetch the data for the new type and check if the requested CName exists.
  //if it does not exist we do not redirect and show the toast, keeping the user on the same page instead of redirecting to the first item.
  let fileName;
  if (newType === "C") fileName = "ClassesInfo.json.gz";
  else if (newType === "S") fileName = "StructsInfo.json.gz";
  else if (newType === "F") fileName = "FunctionsInfo.json.gz";
  else if (newType === "E") fileName = "EnumsInfo.json.gz";
  else return;

  const response = await decompressAndCheckCacheByURL(
    gameDirectory + fileName,
    uploadTS,
  );
  const json = JSON.parse(response);
  const exists = json.data.some((obj) => Object.keys(obj)[0] === CName);

  if (!exists) {
    showToast("Could not find " + CName + "!");
    return;
  }

  //craft the new valid url
  var newURL = window.location.origin + window.location.pathname + "?";

  // no matter what, reset the url params
  newURL += "hash=" + UrlParams["hash"];

  if (newType === "C") newURL += "&type=classes";
  else if (newType === "S") newURL += "&type=structs";
  else if (newType === "F") newURL += "&type=functions";
  else if (newType === "E") newURL += "&type=enums";

  if (member) {
    newURL += "&idx=" + CName + "&member=" + member;
  } else {
    newURL += "&idx=" + CName;
  }
  // Carry the active comparison across cross-type member navigation, so
  // clicking a struct member from a class keeps the diff loaded.
  if (UrlParams["sha"]) newURL += "&sha=" + UrlParams["sha"];
  if (UrlParams["diff"]) newURL += "&diff=" + UrlParams["diff"];

  console.log("[reloadWithNewCName] pushing " + newURL);
  if (newWindow) window.open(newURL, "_blank");
  else history.pushState(null, null, newURL);

  // Reload the page to apply the changes
  if (!newWindow) location.reload();
}

//error? go to home page
function returnHome() {
  history.pushState(null, null, window.location.origin);
  console.log("returnHome called? Unexpected issue?");
  throw e;
  location.reload();
}

const classDiv = document.getElementById("class-list");
// Heights for #class-list are driven entirely by Tailwind classes
// (max-xl:h-64 below xl, xl:flex-1 above) and VirtualList's ResizeObserver
// re-renders on every container size change. No inline-style juggling.

//current gamelistJSON is alwys empty and gets fetched by the server again
var GameListJson = null;

//gets the current game json info by the given hash
async function getGameInfoJsonByHash(hash) {
  if (GameListJson === null) {
    const response = await fetch(
      "https://raw.githubusercontent.com/Spuckwaffel/dumpspace/refs/heads/main/Games/GameList.json",
    );
    GameListJson = await response.json();
  }
  return GameListJson.games.find((game) => game.hash == hash);
}

//the current json of the game containing the real data, eg struct or class
var currentInfoJson = null;
//the current display type, eg struct or class
var currentType = null;

var gameName = "";

var gameDirectory = "";
var rawDirectory = "";

var fileVersion = 0;

var uploadTS = null;
//only should get called once per reload
//makes the game ready to be displayed with displayCurrentType and has basic checks
async function displayCurrentGame() {
  //params always need hash and type
  if (Object.keys(UrlParams).length < 2) returnHome();

  //no hash?
  if (Object.keys(UrlParams)[0] != "hash") returnHome();

  //not supported type param?
  if (
    Object.keys(UrlParams)[1] != "type" ||
    (UrlParams["type"] != "classes" &&
      UrlParams["type"] != "structs" &&
      UrlParams["type"] != "functions" &&
      UrlParams["type"] != "enums" &&
      UrlParams["type"] != "offsets")
  )
    returnHome();

  //get the game json info
  const gameInfoJson = await getGameInfoJsonByHash(UrlParams["hash"]);
  //no game found for hash? go back
  if (gameInfoJson == null) returnHome();

  gameName = gameInfoJson.name;

  uploadTS = gameInfoJson.uploaded;

  //directory is always engine path + location
  gameDirectory =
    "https://raw.githubusercontent.com/Spuckwaffel/dumpspace/refs/heads/main/Games/" +
    gameInfoJson.engine +
    "/" +
    gameInfoJson.location +
    "/";

  rawDirectory = gameInfoJson.engine + "/" + gameInfoJson.location + "/";

  console.log(
    "[displayCurrentGame] Crunching latest data for: " +
      gameDirectory +
      " - " +
      UrlParams["type"],
  );

  const sha = UrlParams["sha"];

  console.log("custom sha?: ", sha);

  if (!sha) {
    //get the data for the current type and check cache persistance
    if (UrlParams["type"] === "classes") {
      const response = await decompressAndCheckCacheByURL(
        gameDirectory + "ClassesInfo.json.gz",
        uploadTS,
      );
      currentInfoJson = JSON.parse(response);
      currentType = "C";
    } else if (UrlParams["type"] === "structs") {
      const response = await decompressAndCheckCacheByURL(
        gameDirectory + "StructsInfo.json.gz",
        uploadTS,
      );
      currentInfoJson = JSON.parse(response);
      currentType = "S";
    } else if (UrlParams["type"] === "functions") {
      const response = await decompressAndCheckCacheByURL(
        gameDirectory + "FunctionsInfo.json.gz",
        uploadTS,
      );
      currentInfoJson = JSON.parse(response);
      currentType = "F";
    } else if (UrlParams["type"] === "enums") {
      const response = await decompressAndCheckCacheByURL(
        gameDirectory + "EnumsInfo.json.gz",
        uploadTS,
      );
      currentInfoJson = JSON.parse(response);
      currentType = "E";
    } else if (UrlParams["type"] === "offsets") {
      const response = await decompressAndCheckCacheByURL(
        gameDirectory + "OffsetsInfo.json.gz",
        uploadTS,
      );
      currentInfoJson = JSON.parse(response);
      currentType = "O";
    }
  } else {
    console.log("getting older data!");
    //get the data for the current type and check cache persistance
    if (UrlParams["type"] === "classes") {
      const response = await decompressJSONByURL(
        `https://raw.githubusercontent.com/Spuckwaffel/dumpspace/${sha}/Games/${rawDirectory}ClassesInfo.json.gz`,
      );
      currentInfoJson = JSON.parse(response);
      currentType = "C";
    } else if (UrlParams["type"] === "structs") {
      const response = await decompressJSONByURL(
        `https://raw.githubusercontent.com/Spuckwaffel/dumpspace/${sha}/Games/${rawDirectory}StructsInfo.json.gz`,
      );
      currentInfoJson = JSON.parse(response);
      currentType = "S";
    } else if (UrlParams["type"] === "functions") {
      const response = await decompressJSONByURL(
        `https://raw.githubusercontent.com/Spuckwaffel/dumpspace/${sha}/Games/${rawDirectory}FunctionsInfo.json.gz`,
      );
      currentInfoJson = JSON.parse(response);
      currentType = "F";
    } else if (UrlParams["type"] === "enums") {
      const response = await decompressJSONByURL(
        `https://raw.githubusercontent.com/Spuckwaffel/dumpspace/${sha}/Games/${rawDirectory}EnumsInfo.json.gz`,
      );
      currentInfoJson = JSON.parse(response);
      currentType = "E";
    } else if (UrlParams["type"] === "offsets") {
      const response = await decompressJSONByURL(
        `https://raw.githubusercontent.com/Spuckwaffel/dumpspace/${sha}/Games/${rawDirectory}OffsetsInfo.json.gz`,
      );
      currentInfoJson = JSON.parse(response);
      currentType = "O";
    }
  }

  //no data?
  if (currentInfoJson == null) returnHome();

  // Sort the array by the object's name
  currentInfoJson.data.sort((a, b) => {
    const nameA = Object.keys(a)[0];
    const nameB = Object.keys(b)[0];
    return nameA.localeCompare(nameB);
  });

  //update the time label
  var timeDiv = document.getElementById("updateLabel");
  if (timeDiv != null) {
    formatElapsedTime(Date.now(), currentInfoJson.updated_at, timeDiv);
  }

  fileVersion = currentInfoJson.version;

  console.log("[DisplayCurrentGame] Using version " + fileVersion);

  //custom
  if (currentType === "O") {
    showOffsets(currentInfoJson.credit, currentInfoJson.data);
    return;
  }

  if (UrlParams["idx"]) {
    //try getting a valid cname out of the params or get the first index of the json
    targetClassName = UrlParams["idx"];
    //or select the first one as default
  } else if (Object.keys(currentInfoJson.data).length > 0) {
    targetClassName = Object.keys(currentInfoJson.data[0])[0];
    //yeah if there arent any items what are we supposed to show lol
  } else returnHome();

  console.log(
    "[displayCurrentGame] Chose name " + targetClassName + " for displaying...",
  );

  var member = null;
  if (UrlParams["member"]) {
    member = UrlParams["member"];
    console.log("[displayCurrentGame] Focussing member " + member);
  }
  //actual baking
  displayCurrentType(targetClassName, member);

  // Shareable diff links: if the URL has ?diff=<sha>, auto-load the diff
  // once the initial render is in.
  if (UrlParams["diff"]) {
    autoApplyDiffFromUrl(UrlParams["diff"]);
  }
}

// Look up the commit's date so the banner shows a real label, then activate
// the diff. Falls back to the short SHA if the API call fails (rate limit,
// no internet, deleted commit, etc.).
async function autoApplyDiffFromUrl(sha) {
  let label = sha.slice(0, 7);
  try {
    const resp = await fetch(
      "https://api.github.com/repos/Spuckwaffel/dumpspace/commits/" + sha,
    );
    if (resp.ok) {
      const c = await resp.json();
      const date = new Date(c.commit.author.date);
      const day = String(date.getDate()).padStart(2, "0");
      const month = date.toLocaleString("en-US", { month: "short" });
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      label = `${day} ${month} ${year} ${hours}:${minutes}`;
    }
  } catch (e) {
    console.warn("[diff] commit lookup failed", e);
  }
  startDiff(sha, label);
}

//persistent global data
//used for vanilla recycler to unhighlight the older focussed div
var focussedCName = null;
//whether we ever formatted the data with vanillarecycler view
var formattedArrayDataValid = false;
//the formatted data we display in the vrv
var formattedArrayData = [];
//names of classes/structs/functions/enums whose bodies are empty — rendered muted in the list
var emptyClassNames = new Set();
//member-name keys that are dumper metadata, not real members. Must match the
//skip-list in displayOverviewPage() / the C++ output in displayStructAndMDKPage().
const RESERVED_MEMBER_NAMES = new Set(["__InheritInfo", "__MDKClassSize"]);
//storing the vrv object
var dVanillaRecyclerView = null;

var firstScroll = true;
var focussedCNameVisible = false;

// Build a single row of the class list. Used by VirtualList.renderItem.
function buildClassListItem(name) {
  const button = document.createElement("button");
  button.dataset.name = name;
  button.classList.add(
    "px-3",
    "py-2",
    "border-b",
    "border-gray-200",
    "dark:border-gray-600",
    "text-left",
    "w-full",
    "h-full",
    "transition",
    "duration-200",
    "ease-in-out",
    "truncate",
    "flex",
    "items-center",
    "gap-2",
    "hover:bg-gray-600/20",
  );

  const nameEl = document.createElement("span");
  nameEl.className = "truncate";
  nameEl.textContent = name;
  button.appendChild(nameEl);

  const diffEntry = diffSummary ? diffSummary.get(name) : null;
  if (diffEntry && diffEntry.status !== "U") {
    const { badge } = getDiffStatusClasses(diffEntry.status);
    const badgeEl = document.createElement("span");
    badgeEl.className =
      "flex-none ml-auto px-1.5 rounded text-[10px] font-bold leading-tight " +
      badge;
    badgeEl.textContent = diffEntry.status;
    button.appendChild(badgeEl);
  }

  if (emptyClassNames.has(name)) {
    button.classList.add("text-slate-400", "dark:text-slate-500");
  }

  button.addEventListener("mouseup", function (event) {
    if (event.button === 1) {
      event.stopPropagation();
      reloadWithNewCName(name, currentType, null, true);
    } else {
      focussedCName = name;
      fixHighlightColor();
      displayCurrentType(name);
    }
  });

  return button;
}

function fixHighlightColor() {
  if (!classDiv) return;
  // Walk every visible row's button. With VirtualList that's just the
  // currently mounted slots — typically ~30 items max.
  const buttons = classDiv.querySelectorAll("button[data-name]");
  let found = false;
  buttons.forEach(function (button) {
    const buttonName = button.dataset.name;
    if (focussedCName !== null && focussedCName === buttonName) {
      button.classList.add("bg-gray-600/10");
      button.classList.remove("hover:bg-gray-600/20");
      found = true;
    } else {
      button.classList.remove("bg-gray-600/10");
      button.classList.add("hover:bg-gray-600/20");
    }
  });
  focussedCNameVisible = found;
}

//only works on current data, if different type than current, call reloadwithnewdata
//good thing about being able to call this func is no refetching of any data, so being once in a viewer
//yoi can navigate every item in the viewer without reloading
function displayCurrentType(CName, member) {
  console.log("[displayCurrentType] Trying to display " + CName);
  focussedCNameVisible = false;
  //fixup cnames having pointers
  if (CName.charAt(CName.length - 1) === "*") {
    CName = CName.slice(0, -1);
  }

  //url specific stuff for history

  // no matter what, reset the url params
  var newURL = "?hash=" + UrlParams["hash"];

  var hadIdx = Object.keys(UrlParams).includes("idx");

  if (currentType === "C") newURL += "&type=classes";
  else if (currentType === "S") newURL += "&type=structs";
  else if (currentType === "F") newURL += "&type=functions";
  else if (currentType === "E") newURL += "&type=enums";

  newURL += "&idx=" + CName;

  if (member) {
    newURL += "&member=" + member;
  }

  if (UrlParams["sha"]) {
    newURL += "&sha=" + UrlParams["sha"];
  }
  // Preserve the active diff so navigating between members doesn't drop it.
  if (UrlParams["diff"]) {
    newURL += "&diff=" + UrlParams["diff"];
  }

  const oldURL = currentURL;
  currentURL = window.location.origin + window.location.pathname + newURL;
  UrlParams = getUrlParams(newURL);

  //only needed on website refresh or clicking on different items
  var scrollToIdx = 0;

  var targetGameClass = null;

  var idx = 0;
  //get the index scroll and also format the data if never formatted (first run)
  for (const gameClass of currentInfoJson.data) {
    idx++;
    const name = Object.keys(gameClass)[0];

    if (!formattedArrayDataValid) {
      formattedArrayData.push(name);

      // Mark entries whose body is empty so the list can render them muted.
      // For classes/structs we strip dumper-metadata keys (__InheritInfo,
      // __MDKClassSize, ...) so a class with only metadata still counts as empty.
      const items = gameClass[name];
      let isEmpty = false;
      if (currentType === "E") {
        isEmpty =
          !Array.isArray(items) ||
          !Array.isArray(items[0]) ||
          items[0].length === 0;
      } else if (currentType === "C" || currentType === "S") {
        isEmpty =
          !Array.isArray(items) ||
          items.filter(
            (m) => !RESERVED_MEMBER_NAMES.has(Object.keys(m)[0]),
          ).length === 0;
      } else {
        isEmpty = !Array.isArray(items) || items.length === 0;
      }
      if (isEmpty) emptyClassNames.add(name);
    }

    if (CName !== null && name === CName) {
      scrollToIdx = idx;
      targetGameClass = gameClass;
    }
  }

  // In diff mode, append entries that exist in the old version but were
  // deleted in the current. They appear in the list (with a red D badge) and
  // are renderable from their old payload.
  if (diffSummary && deletedEntryNames.length > 0) {
    for (const delName of deletedEntryNames) {
      idx++;
      if (!formattedArrayDataValid) formattedArrayData.push(delName);
      if (CName !== null && delName === CName) {
        scrollToIdx = idx;
        targetGameClass = diffSummary.get(delName).oldEntry;
      }
    }
  }

  //is the target game class even there?
  if (targetGameClass == null) {
    //just a bandaid fix displaying older toasts lol
    if (CName != Object.keys(currentInfoJson.data[0])[0]) {
      console.log("[displayCurrentType] Could not find " + CName);
      showToast("Could not find type " + CName + "!");
      //go back to older one that worked, however we dont store the entire url so we have to do some trickery
      const paramsBefore = getUrlParams("." + oldURL.split("?")[1]);
      //guaranteed to be valid
      if (oldURL === currentURL)
        displayCurrentType(Object.keys(currentInfoJson.data[0])[0]);
      else displayCurrentType(paramsBefore[Object.keys(paramsBefore)[2]]);
      return;
    }
  }

  //now we can push, the entry is valid. we do this to not push invalid shit
  if (window.location.href !== currentURL) {
    if (hadIdx) {
      console.log("[displayCurrentType] Pushed " + currentURL + " to history");
      history.pushState(null, "", currentURL);
    } else {
      console.log(
        "[displayCurrentType] Replaced " +
          oldURL +
          " with " +
          currentURL +
          " in history",
      );
      history.replaceState(null, "", currentURL);
    }
  }
  document.title = "Dumpspace - " + gameName;
  document.getElementById("dumpspace-text").textContent = document.title;

  focussedCName = CName;

  //first time? mount the virtualized list
  if (!formattedArrayDataValid) {
    dVanillaRecyclerView = new VirtualList(classDiv, {
      data: formattedArrayData,
      itemHeight: 50,
      renderItem: buildClassListItem,
      onAfterRender: fixHighlightColor,
    });
    formattedArrayDataValid = true;
  }

  //fix the current highlight color because if we do no page reloads we most likely focus a different class
  fixHighlightColor();

  //only scroll if the focussedcname isnt visible in the view, otherwise it has a ugly look
  if (scrollToIdx > 0 && !focussedCNameVisible) {
    // calculating the box with a fixed size of 50px lol
    var scrollTo = scrollToIdx * 50;

    if (firstScroll) {
      scrollTo += 200;
      firstScroll = false;
    } else {
      scrollTo -= 300;
    }

    // Scroll the container to center the button
    //classDiv.style.scrollBehavior = "smooth";
    classDiv.scrollTop = scrollTo;
  }

  // Inheritance only makes sense for classes and structs — hide the
  // button + breadcrumb row for functions/enums.
  const inheritanceRow = document.getElementById("inheritance-row");
  if (inheritanceRow) {
    if (currentType === "C" || currentType === "S") {
      inheritanceRow.classList.remove("hidden");
    } else {
      inheritanceRow.classList.add("hidden");
    }
  }

  // Reveal action UI that was hidden during the initial loading skeleton.
  const copyUrlBtn = document.getElementById("copy-url");
  if (copyUrlBtn) copyUrlBtn.classList.remove("hidden");

  // Selection tabs (Overview / Struct / MDK) only apply to classes & structs.
  // Functions/Enums remove the element entirely further down the call chain.
  const selectionTabs = document.getElementById("selection-tabs");
  if (selectionTabs && (currentType === "C" || currentType === "S")) {
    selectionTabs.classList.remove("hidden");
  }

  // Only reveal #overview-items if no other tab is currently active.
  // Otherwise switching classes while on Struct/MDK would unhide overview
  // on top of the active tab.
  const overviewItems = document.getElementById("overview-items");
  const structVisible =
    document.getElementById("struct-items") &&
    !document.getElementById("struct-items").classList.contains("hidden");
  const mdkVisible =
    document.getElementById("MDK-items") &&
    !document.getElementById("MDK-items").classList.contains("hidden");
  if (overviewItems && !structVisible && !mdkVisible) {
    overviewItems.classList.remove("hidden");
  }

  if (currentType === "C" || currentType === "S")
    displayMembers(CName, targetGameClass);
  if (currentType === "F") displayFunctions(CName, targetGameClass);
  if (currentType === "E") displayEnums(CName, targetGameClass);
}

//save them, used by displayOverviewPage to restore the sticky bar
const emtpyOverViewDivChildren = Array.from(
  document.getElementById("overview-items").children,
);

function displayOverviewPage(CName, members) {
  const itemsOverviewDiv = document.getElementById("overview-items");
  //remove old children
  while (itemsOverviewDiv.firstChild) {
    itemsOverviewDiv.removeChild(itemsOverviewDiv.firstChild);
  }
  for (const child of emtpyOverViewDivChildren) {
    itemsOverviewDiv.appendChild(child);
  }

  // If we're in diff mode and the class itself is deleted, render its OLD
  // members instead of the (nonexistent) current ones, with everything red.
  const diffEntry =
    diffSummary && CName ? diffSummary.get(CName) : null;
  const innerDiffs = diffEntry ? diffEntry.innerDiffs : null;
  const parentDeleted = diffEntry && diffEntry.status === "D";

  // Pre-collect deleted members and sort by their original offset so we can
  // interleave them between live members (so a member that lived at 0x40
  // shows up between the live members at 0x38 and 0x48 — not at the bottom).
  const deletedRows = [];
  if (innerDiffs && !parentDeleted) {
    for (const [delName, mDiff] of innerDiffs) {
      if (mDiff.status !== "D") continue;
      if (!Array.isArray(mDiff.oldValue)) continue;
      const offset =
        typeof mDiff.oldValue[1] === "number" ? mDiff.oldValue[1] : 0;
      deletedRows.push({ delName, ov: mDiff.oldValue, offset });
    }
    deletedRows.sort((a, b) => a.offset - b.offset);
  }
  let delPtr = 0;

  // Helper: render one deleted-member row at the current insertion point.
  function appendDeletedRowOverview({ delName, ov }) {
    const row = document.createElement("div");
    row.className =
      "max-sm:w-[70vh] grid grid-cols-8 text-sm px-2 sm:px-6 pt-2 pb-2 " +
      "border-b border-gray-200 dark:border-gray-600 " +
      "bg-red-50/50 dark:bg-red-950/20 " +
      "text-red-700 dark:text-red-400 relative";

    const marker = document.createElement("span");
    marker.className =
      "absolute left-0 sm:left-2 top-1/2 -translate-y-1/2 font-mono font-bold text-base leading-none text-red-600 dark:text-red-400";
    marker.textContent = "−";
    row.appendChild(marker);

    const typeArr = ov[0];
    const typeP = document.createElement("p");
    typeP.className = "col-span-3 truncate";
    typeP.textContent =
      (typeArr && typeArr[0] ? typeArr[0] : "") +
      (typeArr && typeArr[2] === "*" ? "*" : "");
    row.appendChild(typeP);

    const nameP = document.createElement("p");
    nameP.className = "col-span-3 truncate";
    nameP.textContent = delName;
    row.appendChild(nameP);

    const offP = document.createElement("p");
    offP.className = "col-span-1 font-mono";
    offP.textContent = "0x" + (ov[1] || 0).toString(16);
    row.appendChild(offP);

    const szP = document.createElement("p");
    szP.className = "col-span-1 pl-8 font-mono";
    szP.textContent = String(ov[2] != null ? ov[2] : "");
    row.appendChild(szP);

    itemsOverviewDiv.appendChild(row);
    if (!focusFound) focusIdx++;
  }

  var focusIdx = 0;
  var focusFound = false;
  var memberItemHeight = 0;
  for (const member of members) {
    const memberName = Object.keys(member)[0];
    if (memberName === "__InheritInfo") continue;
    if (memberName === "__MDKClassSize") continue;

    // Look up this member's diff status (if any).
    const memberDiff = innerDiffs ? innerDiffs.get(memberName) : null;

    // Flush any deleted members whose original offset is at or before this
    // live member's offset — they belong above it in the file order.
    const liveOffset =
      typeof member[memberName][1] === "number" ? member[memberName][1] : 0;
    while (
      delPtr < deletedRows.length &&
      deletedRows[delPtr].offset <= liveOffset
    ) {
      appendDeletedRowOverview(deletedRows[delPtr]);
      delPtr++;
    }

    const overviewMemberDiv = document.createElement("div");
    overviewMemberDiv.classList.add(
      "max-sm:w-[70vh]",
      "grid",
      "grid-cols-8",
      "text-sm",
      "px-2",
      "sm:px-6",
      "text-slate-700",
      "dark:text-slate-100",
      "pt-2",
      "pb-2",
      "border-b",
      "border-gray-200",
      "dark:border-gray-600",
      "relative",
    );
    if (memberDiff && memberDiff.status !== "U") {
      const { row } = getDiffStatusClasses(memberDiff.status);
      if (row) overviewMemberDiv.classList.add(...row.split(" "));
    }
    // Diff marker (+/−) lives absolutely at the row's left edge, ignoring the
    // row's horizontal padding so it sits at column 0 like a git diff marker.
    if (memberDiff && (memberDiff.status === "A" || memberDiff.status === "D")) {
      const { marker, markerChar } = getDiffStatusClasses(memberDiff.status);
      const markerEl = document.createElement("span");
      markerEl.className =
        "absolute left-0 sm:left-2 top-1/2 -translate-y-1/2 font-mono font-bold text-base leading-none " + marker;
      markerEl.textContent = markerChar;
      overviewMemberDiv.appendChild(markerEl);
    }

    const memberTypeDiv = document.createElement("div");
    memberTypeDiv.classList.add("col-span-3", "flex");

    let cookMemberType = (typeArr) => {
      const memberTypeButton = document.createElement("button");
      memberTypeButton.classList.add("text-left", "truncate");
      memberTypeButton.textContent = typeArr[0];
      if (typeArr[1] === "C" || typeArr[1] === "S" || typeArr[1] === "E") {
        memberTypeButton.classList.add("underline", "dark:decoration-gray-400");
        memberTypeButton.addEventListener(
          "mouseup",
          function (currentType, memberType, cname, event) {
            if (event.button === 1) {
              event.stopPropagation();
              reloadWithNewCName(cname, memberType, null, true);
            } else {
              if (currentType != memberType) {
                reloadWithNewCName(cname, memberType);
              } else displayCurrentType(cname);
            }
          }.bind(null, currentType, typeArr[1], typeArr[0]),
        );
      } else memberTypeButton.classList.add("cursor-default");
      memberTypeDiv.appendChild(memberTypeButton);
      if (typeArr[3].length > 0) {
        const templateOpenP = document.createElement("p");
        templateOpenP.textContent = "<";
        memberTypeDiv.appendChild(templateOpenP);
        var i = 0;
        for (const submember of typeArr[3]) {
          cookMemberType(submember);
          if (i < typeArr[3].length - 1) {
            const commaP = document.createElement("p");
            commaP.classList.add("pr-1");
            commaP.textContent = ",";
            memberTypeDiv.appendChild(commaP);
          }
          i++;
        }
        const templateCloseP = document.createElement("p");
        templateCloseP.textContent = ">";
        memberTypeDiv.appendChild(templateCloseP);
      }
      if (typeArr[2] === "*") {
        const pointerP = document.createElement("p");
        pointerP.textContent = "*";
        memberTypeDiv.appendChild(pointerP);
      }
    };
    cookMemberType(member[memberName][0]);

    const memberNameButton = document.createElement("button");
    memberNameButton.classList.add("col-span-3", "text-left", "truncate");
    memberNameButton.textContent = member[memberName][0];

    const memberType = member[memberName][3];
    if (memberType === "C" || memberType === "S" || memberType === "E") {
      memberNameButton.classList.add("underline", "dark:decoration-gray-400");
      memberNameButton.addEventListener(
        "click",
        function (currentType, memberType) {
          if (currentType != memberType) {
            reloadWithNewCName(memberNameButton.textContent, memberType);
          } else displayCurrentType(memberNameButton.textContent);
        }.bind(null, currentType, memberType),
      );
    } else memberNameButton.classList.add("cursor-default");

    overviewMemberDiv.appendChild(memberTypeDiv);

    const memberNameDiv = document.createElement("div");
    memberNameDiv.classList.add("flex", "col-span-3", "space-x-3");

    const memberNameP = document.createElement("p");
    memberNameP.classList.add("truncate");
    memberNameP.textContent = memberName;

    if (fileVersion === 10201) {
      // version 1.02.01 has the : 1 within the name
    } else if (fileVersion === 10202) {
      // add : 1 if array size > 4 indicating bitfield
      if (member[memberName].length >= 5) {
        memberNameP.textContent += " : 1";
      }
      // if the arrayDim is > 1 display an C Style array
      if (member[memberName][3] > 1)
        memberNameP.textContent += " [" + member[memberName][3] + "]";
    }

    memberNameDiv.appendChild(memberNameP);

    // Rename annotation: "(was: oldName)" for case-only renames.
    if (memberDiff && memberDiff.renamedFrom) {
      const renameNote = document.createElement("span");
      renameNote.className =
        "ml-2 text-xs italic text-slate-500 dark:text-slate-400";
      renameNote.textContent = "(was: " + memberDiff.renamedFrom + ")";
      memberNameDiv.appendChild(renameNote);
    }

    if (UrlParams["member"]) {
      if (memberName === UrlParams["member"]) {
        overviewMemberDiv.classList.add("bg-sky-400/10");
        focusFound = true;
      }
    }

    const memberLinkButton = document.createElement("button");
    memberLinkButton.classList.add(
      "text-gray-500",
      "dark:text-gray-400",
      "hover:text-blue-500",
      "dark:hover:text-blue-500",
      "hidden",
    );

    function updateMemberParam(memberName) {
      const url = window.location.href;
      const encodedMember = memberName.replace(/ /g, "%20");

      if (url.includes("member=")) {
        // Replace existing member param
        return url.replace(/(member=)[^&]*/, `$1${encodedMember}`);
        //window.location.href = newUrl;
      } else {
        // Add member param at the end, with ? or &
        const separator = url.includes("?") ? "&" : "?";
        return url + separator + "member=" + encodedMember;
      }
    }

    memberLinkButton.addEventListener(
      "click",
      function (bakedString) {
        navigator.clipboard.writeText(bakedString);
        showToast("Copied link to clipboard!", false);
      }.bind(null, updateMemberParam(memberName)),
    );
    var linkSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    linkSVG.setAttribute("width", "20");
    linkSVG.setAttribute("height", "20");
    linkSVG.setAttribute("viewBox", "0 0 24 24");
    linkSVG.setAttribute("fill", "none");

    // Create the path element
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      "M14 7H16C18.7614 7 21 9.23858 21 12C21 14.7614 18.7614 17 16 17H14M10 7H8C5.23858 7 3 9.23858 3 12C3 14.7614 5.23858 17 8 17H10M8 12H16",
    );
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");

    // Append the path element to the SVG element
    linkSVG.appendChild(path);

    memberLinkButton.appendChild(linkSVG);
    memberNameDiv.appendChild(memberLinkButton);

    overviewMemberDiv.appendChild(memberNameDiv);

    const memberOffsetP = document.createElement("p");
    memberOffsetP.classList.add("col-span-1", "font-mono");
    memberOffsetP.textContent =
      "0x" + member[Object.keys(member)[0]][1].toString(16);

    if (fileVersion === 10201) {
      // version 1.02.01 has the : 1 within the name
      if (
        memberName.length > 4 &&
        memberName.charAt(memberName.length - 3) === ":"
      ) {
        memberOffsetP.textContent += " : " + member[memberName][3];
      }
    } else if (fileVersion === 10202) {
      if (member[memberName].length >= 5) {
        memberOffsetP.textContent += " : " + member[memberName][4];
      }
    }
    // If the offset changed in this diff, replace the cell with "old → new".
    if (
      memberDiff &&
      memberDiff.status === "M" &&
      memberDiff.oldValue &&
      memberDiff.newValue &&
      memberDiff.oldValue[1] !== memberDiff.newValue[1]
    ) {
      memberOffsetP.innerHTML = "";
      const oldOff = document.createElement("span");
      oldOff.className = "text-red-500 dark:text-red-400 mr-1";
      oldOff.textContent = "0x" + memberDiff.oldValue[1].toString(16);
      const arrow = document.createElement("span");
      arrow.className = "text-slate-400 mr-1";
      arrow.textContent = "→";
      const newOff = document.createElement("span");
      newOff.className = "text-green-700 dark:text-green-400 font-semibold";
      newOff.textContent = "0x" + memberDiff.newValue[1].toString(16);
      memberOffsetP.appendChild(oldOff);
      memberOffsetP.appendChild(arrow);
      memberOffsetP.appendChild(newOff);
    }
    overviewMemberDiv.appendChild(memberOffsetP);

    const memberSizeP = document.createElement("p");
    memberSizeP.classList.add("col-span-1", "pl-8", "font-mono");
    const memberSizeVal = member[Object.keys(member)[0]][2];
    memberSizeP.textContent = memberSizeVal;
    if (
      memberDiff &&
      memberDiff.status === "M" &&
      memberDiff.oldValue &&
      memberDiff.newValue &&
      memberDiff.oldValue[2] !== memberDiff.newValue[2]
    ) {
      memberSizeP.innerHTML = "";
      memberSizeP.classList.remove("pl-8");
      const oldSz = document.createElement("span");
      oldSz.className = "text-red-500 dark:text-red-400 mr-1";
      oldSz.textContent = String(memberDiff.oldValue[2]);
      const arrow = document.createElement("span");
      arrow.className = "text-slate-400 mr-1";
      arrow.textContent = "→";
      const newSz = document.createElement("span");
      newSz.className = "text-green-700 dark:text-green-400 font-semibold";
      newSz.textContent = String(memberDiff.newValue[2]);
      memberSizeP.appendChild(oldSz);
      memberSizeP.appendChild(arrow);
      memberSizeP.appendChild(newSz);
      memberSizeP.classList.add("col-span-1", "font-mono");
    }
    if (memberSizeVal < 10) memberSizeP.textContent += "\u00A0";
    if (memberSizeVal < 100) memberSizeP.textContent += "\u00A0";

    overviewMemberDiv.appendChild(memberSizeP);

    overviewMemberDiv.addEventListener(
      "mouseover",
      function (button) {
        memberLinkButton.classList.remove("hidden");
      }.bind(null, memberLinkButton),
    );

    overviewMemberDiv.addEventListener(
      "mouseout",
      function (button) {
        memberLinkButton.classList.add("hidden");
      }.bind(null, memberLinkButton),
    );

    itemsOverviewDiv.appendChild(overviewMemberDiv);
    if (!focusFound) focusIdx++;
    else {
      memberItemHeight = overviewMemberDiv.getBoundingClientRect().height;
    }
  }

  // Drain any deleted members whose offset comes after every live member.
  while (delPtr < deletedRows.length) {
    appendDeletedRowOverview(deletedRows[delPtr]);
    delPtr++;
  }

  if (focusFound) {
    const memberList = document.getElementById("member-list");
    const rect = memberList.getBoundingClientRect();

    document.getElementById("member-list").scrollTop =
      focusIdx * memberItemHeight -
      ((rect.height - memberItemHeight) / 2 - memberItemHeight / 2);
  }
}

function displayStructAndMDKPage(CName, members) {
  var textAreaSDKRows = 0;
  var textAreaMDKRows = 0;
  var textAreaSDKText = "// Inheritance: ";
  var textAreaMDKText = "// Inheritance: ";
  for (const member of members) {
    const memberName = Object.keys(member)[0];
    if (memberName === "__InheritInfo") {
      var i = 0;

      var _MDKText = "";
      for (const superClass of member["__InheritInfo"]) {
        textAreaSDKText += superClass;
        textAreaMDKText += superClass;
        if (i < member["__InheritInfo"].length - 1) {
          textAreaSDKText += " > ";
          textAreaMDKText += " > ";
        }
        if (i == 0) {
          _MDKText =
            "\nclass " +
            CName +
            " : public " +
            superClass +
            "\n{\n	friend MDKHandler;\n";

          if (currentType === "S") {
            _MDKText += "	friend MDKBase;\n";
            textAreaMDKRows++;
          }
          textAreaMDKRows += 3;
        }

        i++;
      }

      textAreaMDKText += _MDKText;
      textAreaMDKRows++;
      textAreaSDKText += "\nnamespace " + CName + " {\n";
      textAreaSDKRows += 2;
      continue;
    }
    if (memberName === "__MDKClassSize") {
      textAreaMDKText +=
        "	static inline constexpr uint64_t __MDKClassSize = " +
        member["__MDKClassSize"] +
        ";\n\npublic:\n";
      textAreaMDKRows += 3;
      continue;
    }

    textAreaSDKText += "	constexpr auto ";
    //copy due to changes if its a bit
    var _memberName = memberName;
    //is it a bit?
    var isBitMember = false;
    if (
      _memberName.length > 4 &&
      _memberName.charAt(_memberName.length - 3) === ":"
    ) {
      isBitMember = true;
      _memberName = _memberName.slice(0, -4);
    }
    //use the new name
    textAreaSDKText += _memberName + " = ";
    //we love hex
    textAreaSDKText += "0x" + member[memberName][1].toString(16) + ";";

    textAreaSDKText += " // ";

    let cookMemberTypeText = (typeArr) => {
      var text = typeArr[0];
      if (typeArr[3].length > 0) {
        text += "<";
        var i = 0;
        for (const submember of typeArr[3]) {
          text += cookMemberTypeText(submember);
          if (i < typeArr[3].length - 1) {
            text += ", ";
          }
          i++;
        }
        text += ">";
      }
      if (typeArr[2] === "*") {
        text += "*";
      }
      return text;
    };
    textAreaSDKText += cookMemberTypeText(member[memberName][0]);

    //type of the member

    if (isBitMember) textAreaSDKText += " : 1 (" + member[memberName][3] + ")";
    textAreaSDKText += "\n";
    textAreaSDKRows++;

    //create a new one for shenanigans with the length
    var _textAreaMDKText = "	" + member[memberName][0][1] + "Member(";

    _textAreaMDKText += cookMemberTypeText(member[memberName][0]);
    _textAreaMDKText += ")";
    //format it good aligned
    while (_textAreaMDKText.length < 54) {
      _textAreaMDKText += " ";
    }
    _textAreaMDKText += _memberName;
    while (_textAreaMDKText.length < 114) {
      _textAreaMDKText += " ";
    }
    _textAreaMDKText += "OFFSET(get";
    if (member[memberName][0][1] == "C") {
      _textAreaMDKText += "<T>, ";
    } else if (member[memberName][0][1] == "S") {
      _textAreaMDKText += "Struct<T>, ";
    } else if (member[memberName][0][1] == "D") {
      _textAreaMDKText += "<" + member[memberName][0][0] + ">, ";
    }
    _textAreaMDKText += "{" + "0x" + member[memberName][1].toString(16) + ", ";
    _textAreaMDKText += member[memberName][2] + ", ";
    if (isBitMember) _textAreaMDKText += "1, " + member[memberName][3] + "})\n";
    else _textAreaMDKText += "0, 0})\n";

    textAreaMDKText += _textAreaMDKText;
    textAreaMDKRows++;
  }

  textAreaSDKText += "}";
  textAreaMDKText += "};";
  textAreaSDKRows++;
  textAreaMDKRows += 2;

  applyCppHighlight("struct-items-textarea", textAreaSDKText);
  applyCppHighlight("MDK-items-textarea", textAreaMDKText);
}

// Set source on a <code> block and re-run highlight.js. We have to clear the
// "already highlighted" sentinel because hljs.highlightElement is a no-op
// once it has been applied to an element.
function applyCppHighlight(elementId, text) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = text;
  if (el.dataset) delete el.dataset.highlighted;
  el.removeAttribute("data-highlighted");
  el.className = "language-cpp";
  if (typeof hljs !== "undefined") {
    try {
      hljs.highlightElement(el);
    } catch (e) {
      console.warn("[hljs] highlight failed", e);
    }
  }
}

function displayMembers(CName, data) {
  const members = data[Object.keys(data)[0]];

  if (document.getElementById("class-desc-name") !== null)
    document.getElementById("class-desc-name").textContent = CName;

  var classInheritDiv = document.getElementById("class-desc-inherits");
  if (classInheritDiv == null) returnHome();

  while (classInheritDiv.firstChild) {
    classInheritDiv.removeChild(classInheritDiv.firstChild);
  }

  for (const member of members) {
    const memberName = Object.keys(member)[0];
    //super stuff
    if (memberName === "__InheritInfo") {
      var i = 0;

      for (const superClass of member["__InheritInfo"]) {
        const superButton = document.createElement("button");

        superButton.addEventListener(
          "click",
          function (superClass) {
            displayCurrentType(superClass);
          }.bind(null, superClass),
        );
        superButton.classList.add(
          "transition",
          "duration-200",
          "ease-in-out",
          "hover:text-blue-500",
        );
        superButton.textContent = superClass;

        classInheritDiv.appendChild(superButton);
        if (i < member["__InheritInfo"].length - 1) {
          const textNode = document.createTextNode("\u00A0>\u00A0");
          classInheritDiv.appendChild(textNode);
        }

        i++;
      }
    }
  }

  displayOverviewPage(CName, members);
  displayStructAndMDKPage(CName, members);

  if (document.getElementById("overview-items-skeleton") != null) {
    document.getElementById("overview-items-skeleton").remove();
  }

  if (document.getElementById("class-list-name") != null) {
    document.getElementById("class-list-name").textContent =
      currentType === "C" ? "Classes" : "Structs";
  }

  if (document.getElementById("class-skeleton") != null) {
    document.getElementById("class-skeleton").remove();
  }
}

function displayEnums(CName, data) {
  //remove all children, in function viewer everything works different
  const itemsOverviewDiv = document.getElementById("overview-items");
  while (itemsOverviewDiv.firstChild) {
    itemsOverviewDiv.removeChild(itemsOverviewDiv.firstChild);
  }

  //get the actual array of the cname
  const enumItems = data[Object.keys(data)[0]][0];
  //now this is some next level shit, get the first index of the items,
  //then get the array of the first item and then get the second item which is uint8_t or smth
  const enumType = data[Object.keys(data)[0]][1];
  console.log("type: " + enumType);

  const coreDiv = document.createElement("div");
  coreDiv.classList.add(
    "py-2",
    "px-4",
    "text-slate-700",
    "dark:text-slate-100",
  );

  const enumDiv = document.createElement("div");
  enumDiv.classList.add("flex", "flex-wrap", "items-center", "justify-between");

  const enumHeaderDiv = document.createElement("div");
  enumHeaderDiv.classList.add("flex", "space-x-2");

  const enumNameP = document.createElement("p");
  enumNameP.textContent = "enum class " + CName;
  enumNameP.classList.add(
    "text-ellipsis",
    "overflow-hidden",
    "truncate",
    "sm:max-w-prose",
  );

  const enumTypeP = document.createElement("p");
  enumTypeP.textContent = ": " + enumType;
  enumTypeP.classList.add("text-slate-600", "dark:text-slate-400");

  const enumOpen = document.createElement("p");
  enumOpen.textContent = "{";

  enumHeaderDiv.appendChild(enumNameP);
  enumHeaderDiv.appendChild(enumTypeP);
  enumHeaderDiv.appendChild(enumOpen);

  const enumCopyButton = document.createElement("button");

  enumCopyButton.classList.add(
    "flex",
    "items-center",
    "bg-blue-700",
    "hover:bg-blue-500",
    "py-2",
    "px-4",
    "rounded-md",
    "text-white",
  );

  const svgCopyButton = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  );
  svgCopyButton.setAttribute("width", "20");
  svgCopyButton.setAttribute("height", "20");
  svgCopyButton.setAttribute("viewBox", "0 0 24 24");
  svgCopyButton.setAttribute("stroke", "white");
  svgCopyButton.setAttribute("fill", "none");

  const pathCopyButton = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path",
  );
  pathCopyButton.setAttribute(
    "d",
    "M17.5 14H19C20.1046 14 21 13.1046 21 12V5C21 3.89543 20.1046 3 19 3H12C10.8954 3 10 3.89543 10 5V6.5M5 10H12C13.1046 10 14 10.8954 14 12V19C14 20.1046 13.1046 21 12 21H5C3.89543 21 3 20.1046 3 19V12C3 10.8954 3.89543 10 5 10Z",
  );
  pathCopyButton.setAttribute("stroke-width", "1.5");
  pathCopyButton.setAttribute("stroke-linecap", "round");
  pathCopyButton.setAttribute("stroke-linejoin", "round");

  svgCopyButton.appendChild(pathCopyButton);
  enumCopyButton.appendChild(svgCopyButton);

  var bakedString = enumNameP.textContent + enumTypeP.textContent + " {\n";
  for (const enu of enumItems) {
    const enun = Object.keys(enu);
    bakedString += "  " + enun + " = " + enu[enun] + ", \n";
  }
  bakedString = bakedString.slice(0, -3);
  bakedString += "\n};";
  enumCopyButton.addEventListener(
    "click",
    function (bakedString) {
      navigator.clipboard.writeText(bakedString);
      showToast("Copied enum to clipboard!", false);
    }.bind(null, bakedString),
  );

  enumDiv.appendChild(enumHeaderDiv);

  enumDiv.appendChild(enumCopyButton);

  // Diff context for this enum (name keyed → {status, oldValue, newValue}).
  const eDiffEntry = diffSummary && CName ? diffSummary.get(CName) : null;
  const eInnerDiffs = eDiffEntry ? eDiffEntry.innerDiffs : null;

  const enumFooterDiv = document.createElement("div");
  enumFooterDiv.classList.add("grid", "grid-cols-8", "mx-10");
  var enuItemCount = 0;
  for (const _enu of enumItems) {
    const enu = _enu[Object.keys(_enu)];
    const itemKey = Object.keys(_enu)[0];
    const itemDiff = eInnerDiffs ? eInnerDiffs.get(itemKey) : null;

    const enuItemNameP = document.createElement("p");
    enuItemNameP.classList.add(
      "col-span-7",
      "sm:col-span-6",
      "text-left",
      "truncate",
      "flex",
      "items-center",
    );
    // Diff line marker for added enum items.
    if (itemDiff && itemDiff.status === "A") {
      const m = document.createElement("span");
      m.className = "font-mono font-bold mr-2 text-green-600 dark:text-green-400";
      m.textContent = "+";
      enuItemNameP.appendChild(m);
    }
    const enuName = document.createElement("span");
    enuName.className = "truncate";
    enuName.textContent = itemKey;
    enuItemNameP.appendChild(enuName);
    if (itemDiff && itemDiff.status === "A") {
      enuItemNameP.classList.add(
        "text-green-700",
        "dark:text-green-400",
        "font-semibold",
      );
    } else if (itemDiff && itemDiff.status === "M") {
      enuItemNameP.classList.add(
        "text-amber-700",
        "dark:text-amber-400",
        "font-semibold",
      );
    }
    if (itemDiff && itemDiff.renamedFrom) {
      const renameNote = document.createElement("span");
      renameNote.className =
        "ml-2 text-xs italic text-slate-500 dark:text-slate-400";
      renameNote.textContent = "(was: " + itemDiff.renamedFrom + ")";
      enuItemNameP.appendChild(renameNote);
    }
    enumFooterDiv.appendChild(enuItemNameP);
    const enuItemValueP = document.createElement("p");
    enuItemValueP.classList.add("col-span-1", "sm:col-span-2");

    const trailingComma = enuItemCount < enumItems.length - 1 ? "," : "";

    if (
      itemDiff &&
      itemDiff.status === "M" &&
      itemDiff.oldValue !== itemDiff.newValue
    ) {
      enuItemValueP.innerHTML = "";
      const eq = document.createElement("span");
      eq.textContent = "= ";
      const oldV = document.createElement("span");
      oldV.className = "text-red-500 dark:text-red-400 mr-1";
      oldV.textContent = String(itemDiff.oldValue);
      const arrow = document.createElement("span");
      arrow.className = "text-slate-400 mr-1";
      arrow.textContent = "→";
      const newV = document.createElement("span");
      newV.className = "text-green-700 dark:text-green-400 font-semibold";
      newV.textContent = String(itemDiff.newValue) + trailingComma;
      enuItemValueP.appendChild(eq);
      enuItemValueP.appendChild(oldV);
      enuItemValueP.appendChild(arrow);
      enuItemValueP.appendChild(newV);
    } else {
      enuItemValueP.textContent = "= " + enu + trailingComma;
    }

    enumFooterDiv.appendChild(enuItemValueP);
    enuItemCount++;
  }

  // Append rows for enum values that were deleted in this diff. Skip when
  // the whole enum was deleted — its items were already iterated above.
  const enumParentDeleted = eDiffEntry && eDiffEntry.status === "D";
  if (eInnerDiffs && !enumParentDeleted) {
    for (const [delKey, dDiff] of eInnerDiffs) {
      if (dDiff.status !== "D") continue;
      const delNameP = document.createElement("p");
      delNameP.className =
        "col-span-7 sm:col-span-6 text-left truncate text-red-700 dark:text-red-400 flex items-center";
      const m = document.createElement("span");
      m.className = "font-mono font-bold mr-2 text-red-600 dark:text-red-400";
      m.textContent = "−";
      delNameP.appendChild(m);
      const delName = document.createElement("span");
      delName.className = "truncate";
      delName.textContent = delKey;
      delNameP.appendChild(delName);
      enumFooterDiv.appendChild(delNameP);
      const delValP = document.createElement("p");
      delValP.className =
        "col-span-1 sm:col-span-2 text-red-700 dark:text-red-400";
      delValP.textContent = "= " + String(dDiff.oldValue);
      enumFooterDiv.appendChild(delValP);
    }
  }

  const enumClosureP = document.createElement("p");
  enumClosureP.textContent = "};";

  coreDiv.appendChild(enumDiv);
  coreDiv.appendChild(enumFooterDiv);
  coreDiv.appendChild(enumClosureP);

  itemsOverviewDiv.appendChild(coreDiv);

  if (document.getElementById("class-desc-name") !== null)
    document.getElementById("class-desc-name").textContent = CName;

  if (document.getElementById("class-list-name") != null) {
    document.getElementById("class-list-name").textContent = "Enums";
  }

  //theres only one tab available
  if (document.getElementById("selection-tabs") != null) {
    document.getElementById("selection-tabs").remove();
  }

  if (document.getElementById("class-skeleton") != null) {
    document.getElementById("class-skeleton").remove();
  }

  if (document.getElementById("overview-items-skeleton") != null) {
    document.getElementById("overview-items-skeleton").remove();
  }
}

function displayFunctions(CName, data) {
  //remove all children, in function viewer everything works different
  const itemsOverviewDiv = document.getElementById("overview-items");
  while (itemsOverviewDiv.firstChild) {
    itemsOverviewDiv.removeChild(itemsOverviewDiv.firstChild);
  }

  const funcs = data[Object.keys(data)[0]];

  // Diff context for this class.
  const diffEntry = diffSummary && CName ? diffSummary.get(CName) : null;
  const innerDiffs = diffEntry ? diffEntry.innerDiffs : null;

  var moveTo = 0;
  for (const func of funcs) {
    const funcName = Object.keys(func)[0];
    const fnDiff = innerDiffs ? innerDiffs.get(funcName) : null;

    const coreDiv = document.createElement("div");
    coreDiv.classList.add(
      "border-b",
      "border-gray-200",
      "dark:border-gray-600",
      "py-2",
      "px-4",
      "text-slate-700",
      "dark:text-slate-100",
      "relative",
    );
    if (fnDiff && fnDiff.status !== "U") {
      const { row } = getDiffStatusClasses(fnDiff.status);
      if (row) coreDiv.classList.add(...row.split(" "));
    }
    // Diff marker (+/−) absolute-positioned at the row's left edge, ignoring
    // the row's padding so it sits at column 0.
    if (fnDiff && (fnDiff.status === "A" || fnDiff.status === "D")) {
      const { marker, markerChar } = getDiffStatusClasses(fnDiff.status);
      const fnMarkerEl = document.createElement("span");
      fnMarkerEl.className =
        "absolute left-0 sm:left-2 top-1/2 -translate-y-1/2 font-mono font-bold text-base leading-none " + marker;
      fnMarkerEl.textContent = markerChar;
      coreDiv.appendChild(fnMarkerEl);
    }

    const offsetDiv = document.createElement("div");
    offsetDiv.classList.add("flex", "space-x-4");
    const offsetP = document.createElement("p");
    offsetP.classList.add("text-slate-600", "dark:text-slate-400");
    offsetP.textContent = "Function offset:";
    const offsetButton = document.createElement("button");
    offsetButton.classList.add(
      "transition",
      "duration-200",
      "ease-in-out",
      "hover:text-blue-500",
    );
    offsetButton.textContent = "0x" + func[funcName][2].toString(16);
    offsetButton.addEventListener(
      "click",
      function (textContent) {
        navigator.clipboard.writeText(textContent);
        showToast("Copied offset to clipboard!", false);
      }.bind(null, offsetButton.textContent),
    );

    // When the offset changed in this diff, render "old → new" with the old
    // offset BEFORE the (now green) current one — same layout as overview.
    const offsetChanged =
      fnDiff &&
      fnDiff.status === "M" &&
      fnDiff.oldValue &&
      fnDiff.newValue &&
      fnDiff.oldValue[2] !== fnDiff.newValue[2];
    let oldOffsetEl = null;
    let arrowEl = null;
    if (offsetChanged) {
      oldOffsetEl = document.createElement("span");
      oldOffsetEl.className = "text-red-500 dark:text-red-400";
      oldOffsetEl.textContent = "0x" + fnDiff.oldValue[2].toString(16);
      arrowEl = document.createElement("span");
      arrowEl.className = "text-slate-400";
      arrowEl.textContent = "→";
      offsetButton.classList.add(
        "text-green-700",
        "dark:text-green-400",
        "font-semibold",
      );
    }

    // Rename annotation: "(was: oldName)" for case-only function renames.
    let renameNoteEl = null;
    if (fnDiff && fnDiff.renamedFrom) {
      renameNoteEl = document.createElement("p");
      renameNoteEl.className =
        "text-xs italic text-slate-500 dark:text-slate-400 ml-2";
      renameNoteEl.textContent = "(was: " + fnDiff.renamedFrom + ")";
    }
    const functionFlags = document.createElement("p");
    functionFlags.classList.add(
      "text-slate-600",
      "dark:text-slate-400",
      "pl-4",
      "truncate",
    );
    functionFlags.textContent = func[funcName][3];

    offsetDiv.appendChild(offsetP);
    if (oldOffsetEl) offsetDiv.appendChild(oldOffsetEl);
    if (arrowEl) offsetDiv.appendChild(arrowEl);
    offsetDiv.appendChild(offsetButton);
    if (renameNoteEl) offsetDiv.appendChild(renameNoteEl);
    offsetDiv.appendChild(functionFlags);

    const functionLinkButton = document.createElement("button");
    functionLinkButton.classList.add(
      "text-gray-500",
      "dark:text-gray-400",
      "hover:text-blue-500",
      "dark:hover:text-blue-500",
      "hidden",
    );
    functionLinkButton.addEventListener(
      "click",
      function (bakedString) {
        navigator.clipboard.writeText(bakedString);
        showToast("Copied link to clipboard!", false);
      }.bind(
        null,
        window.location.href.split("&member")[0] +
          "&member=" +
          funcName.replace(/ /g, "%20"),
      ),
    );
    var linkSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    linkSVG.setAttribute("width", "20");
    linkSVG.setAttribute("height", "20");
    linkSVG.setAttribute("viewBox", "0 0 24 24");
    linkSVG.setAttribute("fill", "none");

    // Create the path element
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      "M14 7H16C18.7614 7 21 9.23858 21 12C21 14.7614 18.7614 17 16 17H14M10 7H8C5.23858 7 3 9.23858 3 12C3 14.7614 5.23858 17 8 17H10M8 12H16",
    );
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");

    // Append the path element to the SVG element
    linkSVG.appendChild(path);

    functionLinkButton.appendChild(linkSVG);
    offsetDiv.appendChild(functionLinkButton);

    coreDiv.appendChild(offsetDiv);

    coreDiv.addEventListener(
      "mouseover",
      function (button) {
        button.classList.remove("hidden");
      }.bind(null, functionLinkButton),
    );

    coreDiv.addEventListener(
      "mouseout",
      function (button) {
        button.classList.add("hidden");
      }.bind(null, functionLinkButton),
    );

    const functionDiv = document.createElement("div");
    functionDiv.classList.add(
      "flex",
      "items-center",
      "justify-between",
      "mr-4",
    );
    const functionHeaderDiv = document.createElement("div");
    functionHeaderDiv.classList.add("flex", "truncate");

    let cookMemberType = (typeArr, div) => {
      const memberTypeButton = document.createElement("button");
      memberTypeButton.classList.add("text-left", "truncate");
      memberTypeButton.textContent = typeArr[0];
      if (typeArr[1] === "C" || typeArr[1] === "S" || typeArr[1] === "E") {
        memberTypeButton.classList.add("underline", "dark:decoration-gray-400");
        memberTypeButton.addEventListener(
          "click",
          function (currentType, memberType, cname) {
            if (currentType != memberType) {
              reloadWithNewCName(cname, memberType);
            } else displayCurrentType(cname);
          }.bind(null, currentType, typeArr[1], typeArr[0]),
        );
      } else memberTypeButton.classList.add("cursor-default");
      div.appendChild(memberTypeButton);
      if (typeArr[3].length > 0) {
        const templateOpenP = document.createElement("p");
        templateOpenP.textContent = "<";
        div.appendChild(templateOpenP);
        var i = 0;
        for (const submember of typeArr[3]) {
          cookMemberType(submember, div);
          if (i < typeArr[3].length - 1) {
            const commaP = document.createElement("p");
            commaP.classList.add("pr-1");
            commaP.textContent = ",";
            div.appendChild(commaP);
          }
          i++;
        }
        const templateCloseP = document.createElement("p");
        templateCloseP.textContent = ">";
        div.appendChild(templateCloseP);
      }
      if (typeArr[2] === "*") {
        const pointerP = document.createElement("p");
        pointerP.textContent = "*";
        div.appendChild(pointerP);
      }
    };
    cookMemberType(func[funcName][0], functionHeaderDiv);
    const funcParams = func[funcName][1];
    const funcNameP = document.createElement("p");
    funcNameP.classList.add("pl-2");
    if (funcParams.length > 0) funcNameP.textContent = funcName + "(";
    else funcNameP.textContent = funcName + "();";
    funcNameP.classList.add("text-ellipsis", "overflow-hidden", "truncate");
    functionHeaderDiv.appendChild(funcNameP);

    functionDiv.appendChild(functionHeaderDiv);

    const functionCopyButton = document.createElement("button");

    functionCopyButton.classList.add(
      "flex",
      "items-center",
      "bg-blue-700",
      "hover:bg-blue-500",
      "py-2",
      "px-4",
      "rounded-md",
      "text-white",
    );

    const svgCopyButton = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    svgCopyButton.setAttribute("width", "20");
    svgCopyButton.setAttribute("height", "20");
    svgCopyButton.setAttribute("viewBox", "0 0 24 24");
    svgCopyButton.setAttribute("stroke", "white");
    svgCopyButton.setAttribute("fill", "none");

    const pathCopyButton = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    pathCopyButton.setAttribute(
      "d",
      "M17.5 14H19C20.1046 14 21 13.1046 21 12V5C21 3.89543 20.1046 3 19 3H12C10.8954 3 10 3.89543 10 5V6.5M5 10H12C13.1046 10 14 10.8954 14 12V19C14 20.1046 13.1046 21 12 21H5C3.89543 21 3 20.1046 3 19V12C3 10.8954 3.89543 10 5 10Z",
    );
    pathCopyButton.setAttribute("stroke-width", "1.5");
    pathCopyButton.setAttribute("stroke-linecap", "round");
    pathCopyButton.setAttribute("stroke-linejoin", "round");

    svgCopyButton.appendChild(pathCopyButton);
    functionCopyButton.appendChild(svgCopyButton);

    let cookBakedString = (typeArr) => {
      var text = typeArr[0];
      if (typeArr[3].length > 0) {
        text += "<";
        var i = 0;
        for (const submember of typeArr[3]) {
          text += cookBakedString(submember);
          if (i < typeArr[3].length - 1) {
            text += ", ";
          }
          i++;
        }
        text += ">";
      }
      if (typeArr[2] === "*") {
        text += "*";
      }
      return text;
    };

    var bakedString = cookBakedString(func[funcName][0]) + " " + funcName + "(";

    for (const param of funcParams) {
      bakedString +=
        cookBakedString(param[0]) + param[1] + " " + param[2] + ", ";
    }
    if (funcParams.length > 0) bakedString = bakedString.slice(0, -2);
    bakedString += ");";
    functionCopyButton.addEventListener(
      "click",
      function (bakedString) {
        navigator.clipboard.writeText(bakedString);
        showToast("Copied function to clipboard!", false);
      }.bind(null, bakedString),
    );

    functionDiv.appendChild(functionCopyButton);

    coreDiv.appendChild(functionDiv);

    if (funcParams.length > 0) {
      const functionFooterDiv = document.createElement("div");
      functionFooterDiv.classList.add("grid", "grid-cols-8", "mx-10");
      var paramCount = 0;
      for (const param of funcParams) {
        const functionParamDiv = document.createElement("div");
        functionParamDiv.classList.add("flex", "col-span-4");
        cookMemberType(param[0], functionParamDiv);
        const additionaltype = document.createElement("p");
        additionaltype.textContent = param[1];
        functionParamDiv.appendChild(additionaltype);

        functionFooterDiv.appendChild(functionParamDiv);

        const functionParamNameP = document.createElement("p");
        functionParamNameP.classList.add("col-span-4", "pl-4");

        if (paramCount < funcParams.length - 1)
          functionParamNameP.textContent = param[2] + ",";
        else functionParamNameP.textContent = param[2];

        functionFooterDiv.appendChild(functionParamNameP);
        paramCount++;
      }
      coreDiv.appendChild(functionFooterDiv);
      const functionClosureP = document.createElement("p");
      functionClosureP.textContent = ");";
      coreDiv.appendChild(functionClosureP);
    }
    itemsOverviewDiv.appendChild(coreDiv);
    if (UrlParams["member"]) {
      if (funcName === UrlParams["member"]) {
        coreDiv.classList.add("bg-sky-400/10");
        focusFound = true;
        moveTo = coreDiv.offsetTop;
      }
    }
  }

  // Append rows for functions that were deleted in this diff. Just show the
  // signature outline (offset, name) — sufficient for diff context.
  // Skip when the entire class is deleted — its functions were already iterated.
  const fnParentDeleted = diffEntry && diffEntry.status === "D";
  if (innerDiffs && !fnParentDeleted) {
    for (const [delName, fnDiff] of innerDiffs) {
      if (fnDiff.status !== "D") continue;
      const ov = fnDiff.oldValue;
      if (!Array.isArray(ov)) continue;

      const row = document.createElement("div");
      row.className =
        "border-b border-gray-200 dark:border-gray-600 py-2 px-4 " +
        "bg-red-50/50 dark:bg-red-950/20 " +
        "text-red-700 dark:text-red-400 relative";

      const marker = document.createElement("span");
      marker.className =
        "absolute left-0 sm:left-2 top-1/2 -translate-y-1/2 font-mono font-bold text-base leading-none text-red-600 dark:text-red-400";
      marker.textContent = "−";
      row.appendChild(marker);

      const head = document.createElement("p");
      head.className = "font-semibold";
      head.textContent = "Function offset: 0x" + (ov[2] || 0).toString(16);
      row.appendChild(head);

      const sig = document.createElement("p");
      sig.className = "truncate";
      const retType = Array.isArray(ov[0]) ? ov[0][0] : "";
      sig.textContent = retType + " " + delName + "(...)";
      row.appendChild(sig);

      itemsOverviewDiv.appendChild(row);
    }
  }

  if (moveTo > 0) {
    document.getElementById("member-list").scrollTop =
      moveTo -
      document.getElementById("member-list").getBoundingClientRect().height / 2;
  }

  if (document.getElementById("class-desc-name") !== null)
    document.getElementById("class-desc-name").textContent = CName;

  if (document.getElementById("class-list-name") != null) {
    document.getElementById("class-list-name").textContent = "Functions";
  }

  //theres only one tab available
  if (document.getElementById("selection-tabs") != null) {
    document.getElementById("selection-tabs").remove();
  }

  if (document.getElementById("class-skeleton") != null) {
    document.getElementById("class-skeleton").remove();
  }

  if (document.getElementById("overview-items-skeleton") != null) {
    document.getElementById("overview-items-skeleton").remove();
  }
}

function showOverview() {
  var itemOverview = document.getElementById("overview-items");
  var itemClickDiv = document.getElementById("overview-click-div");
  var structOverview = document.getElementById("struct-items");
  var structClickDiv = document.getElementById("struct-click-div");
  var MDKOverview = document.getElementById("MDK-items");
  var MDKClickDiv = document.getElementById("mdk-click-div");

  if (itemOverview != null) itemOverview.classList.remove("hidden");
  if (itemClickDiv != null)
    itemClickDiv.classList.add("bg-gray-50", "dark:bg-slate-800");

  if (structOverview != null) structOverview.classList.add("hidden");
  if (structClickDiv != null)
    structClickDiv.classList.remove("bg-gray-50", "dark:bg-slate-800");

  if (MDKOverview != null) MDKOverview.classList.add("hidden");
  if (MDKClickDiv != null)
    MDKClickDiv.classList.remove("bg-gray-50", "dark:bg-slate-800");
}

function showStruct() {
  var itemOverview = document.getElementById("overview-items");
  var itemClickDiv = document.getElementById("overview-click-div");
  var structOverview = document.getElementById("struct-items");
  var structClickDiv = document.getElementById("struct-click-div");
  var MDKOverview = document.getElementById("MDK-items");
  var MDKClickDiv = document.getElementById("mdk-click-div");

  if (structOverview != null) structOverview.classList.remove("hidden");
  if (structClickDiv != null)
    structClickDiv.classList.add("bg-gray-50", "dark:bg-slate-800");

  if (itemOverview != null) itemOverview.classList.add("hidden");
  if (itemClickDiv != null)
    itemClickDiv.classList.remove("bg-gray-50", "dark:bg-slate-800");

  if (MDKOverview != null) MDKOverview.classList.add("hidden");
  if (MDKClickDiv != null)
    MDKClickDiv.classList.remove("bg-gray-50", "dark:bg-slate-800");
}

function showMDK() {
  var itemOverview = document.getElementById("overview-items");
  var itemClickDiv = document.getElementById("overview-click-div");
  var structOverview = document.getElementById("struct-items");
  var structClickDiv = document.getElementById("struct-click-div");
  var MDKOverview = document.getElementById("MDK-items");
  var MDKClickDiv = document.getElementById("mdk-click-div");

  if (MDKOverview != null) MDKOverview.classList.remove("hidden");
  if (MDKClickDiv != null)
    MDKClickDiv.classList.add("bg-gray-50", "dark:bg-slate-800");

  if (structOverview != null) structOverview.classList.add("hidden");
  if (structClickDiv != null)
    structClickDiv.classList.remove("bg-gray-50", "dark:bg-slate-800");

  if (itemOverview != null) itemOverview.classList.add("hidden");
  if (itemClickDiv != null)
    itemClickDiv.classList.remove("bg-gray-50", "dark:bg-slate-800");
}

function showOffsets(credit, dataJSON) {
  document.title = "Dumpspace - " + gameName;
  document.getElementById("dumpspace-text").textContent = document.title;

  //document.getElementById("offset-announcement").classList.remove("hidden");

  const viewer = document.getElementById("full-viewer");
  while (viewer.firstChild) {
    viewer.removeChild(viewer.firstChild);
  }
  viewer.classList.remove(
    "xl:grid",
    "xl:grid-cols-4",
    "xl:gap-4",
    "xl:px-32",
    "px-4",
    "top-10",
  );
  viewer.classList.add("xl:px-64", "md:px-32", "px-8");
  const fullOffsetDiv = document.createElement("div");
  fullOffsetDiv.classList.add(
    "border",
    "py-4",
    "my-16",
    "px-4",
    "rounded-lg",
    "border-gray-200",
    "dark:border-gray-600",
    "text-slate-700",
    "dark:text-slate-100",
  );
  function fmtOffsetVal(v) {
    return typeof v === "number" && !Number.isNaN(v)
      ? "0x" + v.toString(16)
      : String(v);
  }

  for (const offset of dataJSON) {
    const oDiff = diffSummary ? diffSummary.get(offset[0]) : null;

    const offsetDiv = document.createElement("div");
    offsetDiv.classList.add(
      "border-b",
      "border-gray-200",
      "dark:border-gray-600",
      "flex",
      "justify-between",
      "py-3",
      "relative",
    );
    if (oDiff && oDiff.status !== "U") {
      const { row } = getDiffStatusClasses(oDiff.status);
      if (row) offsetDiv.classList.add(...row.split(" "));
    }
    if (oDiff && (oDiff.status === "A" || oDiff.status === "D")) {
      const { marker, markerChar } = getDiffStatusClasses(oDiff.status);
      const markerEl = document.createElement("span");
      markerEl.className =
        "absolute left-0 sm:left-2 top-1/2 -translate-y-1/2 font-mono font-bold text-base leading-none " +
        marker;
      markerEl.textContent = markerChar;
      offsetDiv.appendChild(markerEl);
    }

    const offsetNameP = document.createElement("p");
    offsetNameP.classList.add("self-center", "font-semibold");
    offsetNameP.textContent = offset[0];

    const offsetNumP = document.createElement("p");
    offsetNumP.classList.add("self-center", "pr-4", "flex", "items-center", "gap-2");
    if (
      oDiff &&
      oDiff.status === "M" &&
      oDiff.oldValue &&
      oDiff.newValue &&
      oDiff.oldValue[1] !== oDiff.newValue[1]
    ) {
      const oldEl = document.createElement("span");
      oldEl.className = "text-red-500 dark:text-red-400";
      oldEl.textContent = fmtOffsetVal(oDiff.oldValue[1]);
      const arrowEl = document.createElement("span");
      arrowEl.className = "text-slate-400";
      arrowEl.textContent = "→";
      const newEl = document.createElement("span");
      newEl.className = "text-green-700 dark:text-green-400 font-semibold";
      newEl.textContent = fmtOffsetVal(oDiff.newValue[1]);
      offsetNumP.appendChild(oldEl);
      offsetNumP.appendChild(arrowEl);
      offsetNumP.appendChild(newEl);
    } else {
      offsetNumP.textContent = fmtOffsetVal(offset[1]);
    }

    const rightSideDiv = document.createElement("div");
    rightSideDiv.classList.add("flex");
    const offsetCopyButton = document.createElement("button");

    offsetCopyButton.classList.add(
      "flex",
      "items-center",
      "bg-blue-700",
      "hover:bg-blue-500",
      "py-2",
      "px-4",
      "rounded-md",
      "text-white",
    );

    const svgCopyButton = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    svgCopyButton.setAttribute("width", "20");
    svgCopyButton.setAttribute("height", "20");
    svgCopyButton.setAttribute("viewBox", "0 0 24 24");
    svgCopyButton.setAttribute("stroke", "white");
    svgCopyButton.setAttribute("fill", "none");

    const pathCopyButton = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    pathCopyButton.setAttribute(
      "d",
      "M17.5 14H19C20.1046 14 21 13.1046 21 12V5C21 3.89543 20.1046 3 19 3H12C10.8954 3 10 3.89543 10 5V6.5M5 10H12C13.1046 10 14 10.8954 14 12V19C14 20.1046 13.1046 21 12 21H5C3.89543 21 3 20.1046 3 19V12C3 10.8954 3.89543 10 5 10Z",
    );
    pathCopyButton.setAttribute("stroke-width", "1.5");
    pathCopyButton.setAttribute("stroke-linecap", "round");
    pathCopyButton.setAttribute("stroke-linejoin", "round");

    svgCopyButton.appendChild(pathCopyButton);
    offsetCopyButton.appendChild(svgCopyButton);

    const bakedString =
      "constexpr auto " +
      offset[0] +
      " = " +
      (typeof offset[1] === "number" && !Number.isNaN(offset[1])
        ? "0x" + offset[1].toString(16)
        : offset[1]) +
      ";";

    offsetCopyButton.addEventListener(
      "click",
      function (bakedString) {
        navigator.clipboard.writeText(bakedString);
        showToast("Copied offset to clipboard!", false);
      }.bind(null, bakedString),
    );

    offsetDiv.appendChild(offsetNameP);

    rightSideDiv.appendChild(offsetNumP);
    rightSideDiv.appendChild(offsetCopyButton);
    offsetDiv.appendChild(rightSideDiv);

    fullOffsetDiv.appendChild(offsetDiv);
  }

  // Append rows for offsets that were deleted in this diff.
  if (diffSummary) {
    for (const [delName, dDiff] of diffSummary) {
      if (dDiff.status !== "D") continue;
      const ov = dDiff.oldValue;
      if (!Array.isArray(ov)) continue;
      const row = document.createElement("div");
      row.className =
        "border-b border-gray-200 dark:border-gray-600 flex justify-between py-3 " +
        "bg-red-50/50 dark:bg-red-950/20 text-red-700 dark:text-red-400 relative";

      const marker = document.createElement("span");
      marker.className =
        "absolute left-0 sm:left-2 top-1/2 -translate-y-1/2 font-mono font-bold text-base leading-none text-red-600 dark:text-red-400";
      marker.textContent = "−";
      row.appendChild(marker);

      const nameP = document.createElement("p");
      nameP.className = "self-center font-semibold";
      nameP.textContent = delName;
      row.appendChild(nameP);

      const valP = document.createElement("p");
      valP.className = "self-center pr-4";
      valP.textContent = fmtOffsetVal(ov[1]);
      row.appendChild(valP);

      fullOffsetDiv.appendChild(row);
    }
  }

  viewer.appendChild(fullOffsetDiv);
  if (credit !== undefined) {
    const creditDiv = document.createElement("div");
    creditDiv.classList.add(
      "self-center",
      "font-semibold",
      "text-slate-700",
      "dark:text-slate-100",
      "-my-16",
      "px-2",
      "pb-16",
      "transition",
      "duration-200",
      "ease-in-out",
      "hover:text-blue-500",
    );
    const creditA = document.createElement("a");
    creditA.textContent = "Created By " + credit.dumper_used;
    creditA.href = credit.dumper_link;
    creditDiv.appendChild(creditA);
    viewer.appendChild(creditDiv);
  }
}

if (
  Object.keys(UrlParams).length === 0 ||
  Object.keys(UrlParams)[0] !== "hash" ||
  (UrlParams["hash"].length !== 16 && UrlParams["hash"].length !== 8)
) {
  returnHome();
}

//fix when the games folder is first downloaded classes are listed by default
if (Object.keys(UrlParams).length === 1) {
  getGameInfo("classes", false, false, false);
}

//add reload listener
window.addEventListener("popstate", function () {
  var oldParams = getUrlParams(currentURL);
  var newParams = getUrlParams();
  console.log(
    "viewer changed from type " +
      oldParams[Object.keys(oldParams)[1]] +
      " -> " +
      newParams[Object.keys(newParams)[1]],
  );
  if (
    newParams == null ||
    newParams.length < 3 ||
    Object.keys(newParams)[0] != "hash" ||
    Object.keys(newParams)[1] != "type" ||
    oldParams[Object.keys(oldParams)[0]] !==
      newParams[Object.keys(newParams)[0]] ||
    oldParams[Object.keys(oldParams)[1]] !==
      newParams[Object.keys(newParams)[1]] ||
    newParams[Object.keys(newParams)[2]] == null
  ) {
    location.reload();
    return;
  }

  console.log("page reload was not needed!");
  displayCurrentType(newParams[Object.keys(newParams)[2]]);
});

//display! yay!
displayCurrentGame();

const toastDiv = document.getElementById("toast-div");
const toastCheck = document.getElementById("toast-check");
const toastError = document.getElementById("toast-error");
const toastDivText = document.getElementById("toast-div-text");

// Toast lifecycle: auto-dismiss after 3s, hover pauses, click dismisses now.
let toastHideTimer = null;

function hideToastNow() {
  if (toastHideTimer) {
    clearTimeout(toastHideTimer);
    toastHideTimer = null;
  }
  toastDiv.classList.remove("opacity-100", "translate-y-0", "pointer-events-auto");
  toastDiv.classList.add("opacity-0", "translate-y-3", "pointer-events-none");
}

function scheduleToastHide(ms = 3000) {
  if (toastHideTimer) clearTimeout(toastHideTimer);
  toastHideTimer = setTimeout(hideToastNow, ms);
}

toastDiv.addEventListener("mouseenter", function () {
  if (toastHideTimer) {
    clearTimeout(toastHideTimer);
    toastHideTimer = null;
  }
});
toastDiv.addEventListener("mouseleave", function () {
  scheduleToastHide();
});
toastDiv.addEventListener("click", hideToastNow);

document.getElementById("copy-url").addEventListener("click", function () {
  navigator.clipboard.writeText(window.location.href);
  showToast("Copied URL to clipboard!", false);
});

function copyTextareaToClipboard(elementId, label) {
  const el = document.getElementById(elementId);
  if (!el) return;
  // Works for both <textarea> (.value) and <pre><code> (.textContent).
  const text = el.value !== undefined ? el.value : el.textContent;
  navigator.clipboard.writeText(text);
  showToast(label, false);
}

function showToast(name, error = true) {
  if (toastDiv == null) return;

  if (toastDivText != null) toastDivText.textContent = name;

  if (error) {
    toastCheck.classList.add("hidden");
    toastError.classList.remove("hidden");
  } else {
    toastError.classList.add("hidden");
    toastCheck.classList.remove("hidden");
  }

  // Reveal: slide up + fade in via the transition classes on the wrapper.
  toastDiv.classList.remove("opacity-0", "translate-y-3", "pointer-events-none");
  toastDiv.classList.add("opacity-100", "translate-y-0", "pointer-events-auto");

  scheduleToastHide();
}

const searchInput = document.getElementById("class-search-input");
const searchCancelButton = document.getElementById("search-cancel-button");

function handleSearchInput() {
  var filter = searchInput.value.toUpperCase();
  var formattedArrayDataRef = [];
  if (filter.length > 0) {
    searchCancelButton.classList.remove("hidden");
  } else searchCancelButton.classList.add("hidden");
  if (filter === "") {
    formattedArrayDataRef = formattedArrayData;
  } else {
    for (i = 0; i < formattedArrayData.length; i++) {
      if (formattedArrayData[i].toUpperCase().includes(filter) === true) {
        formattedArrayDataRef.push(formattedArrayData[i]);
      }
    }
  }
  dVanillaRecyclerView.setData(formattedArrayDataRef);
  classDiv.scrollTop = 0;
}
searchCancelButton.addEventListener("click", function () {
  searchInput.value = "";
  handleSearchInput();
});

document
  .getElementById("ClassesButton")
  .addEventListener("mouseup", function (event) {
    getGameInfo("classes", true, event.button === 1);
  });
document
  .getElementById("StructsButton")
  .addEventListener("mouseup", function (event) {
    getGameInfo("structs", true, event.button === 1);
  });
document
  .getElementById("FunctionsButton")
  .addEventListener("mouseup", function (event) {
    getGameInfo("functions", true, event.button === 1);
  });
document
  .getElementById("EnumsButton")
  .addEventListener("mouseup", function (event) {
    getGameInfo("enums", true, event.button === 1);
  });
document
  .getElementById("OffsetsButton")
  .addEventListener("mouseup", function (event) {
    getGameInfo("offsets", true, event.button === 1);
  });

document.body.onmousedown = function (e) {
  if (e.button === 1) return false;
};

function findInheritances(name) {
  const inheritances = [];
  for (const gameClass of currentInfoJson.data) {
    const info = Object.keys(gameClass)[0];
    const inheritInfo = gameClass[info][0]["__InheritInfo"];
    if (inheritInfo.length > 0 && inheritInfo[0] === name) {
      inheritances.push(info);
    }
  }
  return inheritances;
}

function toggleInheritanceView() {
  document.getElementById("InheritanceViewerDiv").classList.toggle("hidden");
  handleInheritanceView();
}

// Holds the current Cytoscape instance so we can tear it down before re-rendering.
let inheritanceCy = null;

// Register the dagre layout extension once the libraries are loaded.
let inheritanceDagreReady = false;
function ensureInheritanceDagre() {
  if (inheritanceDagreReady) return true;
  if (typeof cytoscape === "undefined" || typeof cytoscapeDagre === "undefined") {
    return false;
  }
  cytoscape.use(cytoscapeDagre);
  inheritanceDagreReady = true;
  return true;
}

function handleInheritanceView() {
  const innerDiv = document.getElementById("InheritanceViewerInnerDiv");
  const innerIdleDiv = document.getElementById("InheritanceViewer-spinner");
  innerDiv.classList.add("hidden");
  innerIdleDiv.classList.remove("hidden");

  const selectedRadio = document.querySelector(
    'input[name="inherit-depth-radio"]:checked',
  );
  const selectedValue = Number(
    document.querySelector(`label[for="${selectedRadio.id}"]`).textContent || 0,
  );

  // Walk descendants (same direction as the old Mermaid graph).
  const root = document.getElementById("class-desc-name").textContent;
  const nodeIds = new Set([root]);
  const edges = [];
  function addInstances(parent, depthLeft) {
    for (const child of findInheritances(parent)) {
      edges.push({
        data: { id: parent + "->" + child, source: parent, target: child },
      });
      nodeIds.add(child);
      if (depthLeft > 0) addInstances(child, depthLeft - 1);
    }
  }
  addInstances(root, selectedValue - 1);

  if (!ensureInheritanceDagre()) {
    showToast("Inheritance graph library failed to load.");
    return;
  }

  // Tear down any previous instance.
  if (inheritanceCy) {
    inheritanceCy.destroy();
    inheritanceCy = null;
  }
  innerDiv.innerHTML = "";

  // Reveal the container BEFORE mounting so Cytoscape can measure it.
  innerDiv.classList.remove("hidden");
  innerIdleDiv.classList.add("hidden");

  const isDark = document.documentElement.classList.contains("dark");
  const nodeBg = isDark ? "#1e293b" : "#f8fafc"; // slate-800 / slate-50
  const nodeBorder = isDark ? "#475569" : "#cbd5e1"; // slate-600 / slate-300
  const nodeText = isDark ? "#f1f5f9" : "#1e293b"; // slate-100 / slate-800
  const rootBg = "#1d4ed8"; // blue-700
  const edgeColor = isDark ? "#64748b" : "#94a3b8"; // slate-500 / slate-400

  // requestAnimationFrame ensures the unhide above has been flushed so the
  // container reports its real size when Cytoscape mounts.
  requestAnimationFrame(() => {
    inheritanceCy = cytoscape({
      container: innerDiv,
      elements: {
        nodes: [...nodeIds].map((id) => ({
          data: { id, label: id, isRoot: id === root },
        })),
        edges,
      },
      layout: {
        name: "dagre",
        rankDir: "LR",
        nodeSep: 24,
        rankSep: 90,
        animate: false,
      },
      style: [
        {
          selector: "node",
          style: {
            shape: "round-rectangle",
            "background-color": nodeBg,
            "border-color": nodeBorder,
            "border-width": 1,
            color: nodeText,
            label: "data(label)",
            "text-valign": "center",
            "text-halign": "center",
            "font-size": "13px",
            "font-family": "Inter, ui-sans-serif, sans-serif",
            "font-weight": 500,
            padding: "10px",
            width: "label",
            height: "label",
            "text-wrap": "none",
          },
        },
        {
          selector: "node[?isRoot]",
          style: {
            "background-color": rootBg,
            "border-color": rootBg,
            color: "#ffffff",
            "font-weight": 700,
          },
        },
        {
          selector: "node:active",
          style: { "overlay-opacity": 0 },
        },
        {
          selector: "edge",
          style: {
            "curve-style": "bezier",
            "target-arrow-shape": "triangle",
            "target-arrow-color": edgeColor,
            "line-color": edgeColor,
            width: 1.5,
          },
        },
      ],
      wheelSensitivity: 0.2,
      minZoom: 0.2,
      maxZoom: 3,
    });

    // Click any non-root node to navigate to it in-place (no page reload).
    // The graph only contains classes from the currently loaded type, so we
    // can reuse the same pattern the class-list buttons use.
    inheritanceCy.on("tap", "node", function (event) {
      const name = event.target.id();
      if (!name || name === root) return;
      focussedCName = name;
      fixHighlightColor();
      displayCurrentType(name);
      // Close the modal so the user actually sees the new class.
      document.getElementById("InheritanceViewerDiv").classList.add("hidden");
    });

    inheritanceCy.fit(undefined, 30);
  });
}

async function getCommits() {
  const owner = "Spuckwaffel";
  const repo = "dumpspace";
  const filePath = `Games/${rawDirectory}`;
  const perPage = 100;

  const historyDiv = document.getElementById("uploadHistoryInnerDiv");
  const updateSpinner = document.getElementById("uploadHistory-spinner");

  updateSpinner.classList.remove("hidden");

  historyDiv.classList.add("hidden");
  historyDiv.innerHTML = "";

  function formatDate(dateStr) {
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, "0");
    const month = date.toLocaleString("en-US", { month: "short" });
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${day} ${month} ${year} ${hours}:${minutes}`;
  }

  let nextSha = "main"; // Start from main branch (or another starting commit/branch)
  let hasMoreCommits = true;

  // The "currently viewed" version: explicit ?sha= when set, otherwise
  // implicitly the latest merge commit on main (which is what no-sha loads).
  // We use this to disable the Compare button on whatever row IS the current
  // version, so users can't diff a snapshot against itself.
  const viewingSha = UrlParams["sha"] || null;
  let isFirstMerge = true;

  const newURL = window.location.href;

  while (hasMoreCommits) {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits?path=${encodeURIComponent(
      filePath,
    )}&per_page=${perPage}&sha=${nextSha}`;

    const response = await fetch(url);

    historyDiv.classList.remove("hidden");
    document.getElementById("uploadHistory-spinner").classList.add("hidden");

    if (!response.ok) {
      showToast(`Error fetching commits: ${response.status}`);
      return;
    }

    const commits = await response.json();
    console.log("Fetched commits:", commits.length);

    if (commits.length === 0) {
      hasMoreCommits = false;
      break;
    }

    let foundMergeCommits = false;

    for (const commit of commits) {
      if (commit.parents.length < 2) continue;

      foundMergeCommits = true;

      // Decide whether this commit IS the version currently being viewed.
      const isCurrentVersion = viewingSha
        ? commit.sha === viewingSha
        : isFirstMerge;
      isFirstMerge = false;

      const innerDiv = document.createElement("a");
      if (newURL.includes("sha=")) {
        innerDiv.href = newURL.replace(/(sha=)[^&]*/, `$1${commit.sha}`);
      } else {
        const separator = newURL.includes("?") ? "&" : "?";
        innerDiv.href = newURL + separator + "sha=" + commit.sha;
      }

      innerDiv.className =
        "w-full grid grid-cols-4 items-center text-sm text-slate-700 dark:text-slate-100 pt-2 pb-2 border-b border-gray-200 dark:border-gray-600";

      const dateP = document.createElement("p");
      dateP.classList.add("font-mono");
      dateP.textContent = formatDate(commit.commit.author.date);
      innerDiv.appendChild(dateP);

      const timeAgoP = document.createElement("p");
      formatElapsedTime(
        Date.now(),
        new Date(commit.commit.author.date),
        timeAgoP,
      );
      innerDiv.appendChild(timeAgoP);

      const authorP = document.createElement("p");
      authorP.className = "font-semibold";
      const match = commit.commit.message.match(/from (\S+)\//);
      if (match) authorP.textContent = match[1];
      innerDiv.appendChild(authorP);

      // Compare button — diffs the current view against this commit's version.
      // Stops the surrounding <a> from navigating. Disabled when this row IS
      // the version currently being viewed (would be a no-op diff).
      const compareBtn = document.createElement("button");
      compareBtn.type = "button";
      const dateLabel = formatDate(commit.commit.author.date);
      if (isCurrentVersion) {
        compareBtn.className =
          "justify-self-end text-xs px-2 py-1 bg-slate-200/50 dark:bg-slate-700/50 " +
          "text-slate-500 dark:text-slate-400 rounded cursor-not-allowed";
        compareBtn.textContent = "Current";
        compareBtn.disabled = true;
        compareBtn.title = "This is the version you're currently viewing";
        compareBtn.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
        });
      } else {
        compareBtn.className =
          "justify-self-end text-xs px-2 py-1 bg-slate-200 dark:bg-slate-700 " +
          "hover:bg-blue-500 hover:text-white dark:text-slate-100 rounded " +
          "transition duration-200";
        compareBtn.textContent = "Compare";
        compareBtn.title = "Compare current version against this commit";
        compareBtn.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          startDiff(commit.sha, dateLabel);
        });
      }
      innerDiv.appendChild(compareBtn);

      historyDiv.appendChild(innerDiv);
    }

    // Update SHA to last commit's SHA to continue walking back
    nextSha = commits[commits.length - 1].sha;

    // Stop if there are no merge commits in this batch to avoid unnecessary paging (optional)
    if (!foundMergeCommits) break;
  }
}

document
  .getElementById("history-updates")
  .addEventListener("click", function () {
    document.getElementById("uploadHistoryDiv").classList.remove("hidden");
    getCommits();
  });

function toggleHistoryView() {
  document.getElementById("uploadHistoryDiv").classList.add("hidden");
}

// ============================================================
// DIFF MODE — compare current viewed type against an older commit
// ============================================================

// Diff state (only one diff active at a time, scoped to currentType).
let diffActiveSha = null;
let diffActiveDate = null;
let diffSummary = null; // Map<entryName, { status, oldEntry, newEntry, innerDiffs }>
let deletedEntryNames = []; // names present in old but missing in current

// Reflect the active diff in the URL so the page state is shareable. Pass
// null to remove the param.
function setUrlDiffParam(sha) {
  const u = new URL(window.location.href);
  const currentDiff = u.searchParams.get("diff");
  if (sha) {
    if (currentDiff === sha) return;
    u.searchParams.set("diff", sha);
  } else {
    if (!currentDiff) return;
    u.searchParams.delete("diff");
  }
  history.pushState(null, "", u.toString());
  UrlParams = getUrlParams(u.search);
  currentURL = u.toString();
}

function typeFileForCurrent() {
  if (currentType === "C") return "ClassesInfo.json.gz";
  if (currentType === "S") return "StructsInfo.json.gz";
  if (currentType === "F") return "FunctionsInfo.json.gz";
  if (currentType === "E") return "EnumsInfo.json.gz";
  if (currentType === "O") return "OffsetsInfo.json.gz";
  return null;
}

// Offsets diff has a different shape — each entry is a flat [name, value]
// tuple rather than a nested {name: body} object. Build a per-offset diff
// map keyed by offset name.
function buildOffsetsDiffSummary(oldData, newData) {
  const summary = new Map();
  const oldByName = new Map();
  for (const o of oldData || []) {
    if (Array.isArray(o) && o.length >= 1) oldByName.set(o[0], o);
  }
  const newByName = new Map();
  for (const o of newData || []) {
    if (Array.isArray(o) && o.length >= 1) newByName.set(o[0], o);
  }
  for (const [name, newVal] of newByName) {
    if (!oldByName.has(name)) {
      summary.set(name, { status: "A", oldValue: null, newValue: newVal });
    } else {
      const oldVal = oldByName.get(name);
      const same = oldVal[1] === newVal[1];
      summary.set(name, {
        status: same ? "U" : "M",
        oldValue: oldVal,
        newValue: newVal,
      });
    }
  }
  const deletedNames = [];
  for (const [name, oldVal] of oldByName) {
    if (!newByName.has(name)) {
      summary.set(name, { status: "D", oldValue: oldVal, newValue: null });
      deletedNames.push(name);
    }
  }
  return { summary, deletedNames };
}

function entriesToMap(arr) {
  const m = new Map();
  if (!Array.isArray(arr)) return m;
  for (const e of arr) m.set(Object.keys(e)[0], e);
  return m;
}

function membersArrayToMap(membersArr) {
  const m = new Map();
  if (!Array.isArray(membersArr)) return m;
  for (const member of membersArr) {
    const k = Object.keys(member)[0];
    if (RESERVED_MEMBER_NAMES.has(k)) continue;
    m.set(k, member[k]);
  }
  return m;
}

function functionsArrayToMap(funcsArr) {
  const m = new Map();
  if (!Array.isArray(funcsArr)) return m;
  for (const f of funcsArr) m.set(Object.keys(f)[0], f[Object.keys(f)[0]]);
  return m;
}

function enumValuesToMap(enumEntry) {
  const m = new Map();
  if (!Array.isArray(enumEntry) || !Array.isArray(enumEntry[0])) return m;
  for (const item of enumEntry[0]) {
    const k = Object.keys(item)[0];
    m.set(k, item[k]);
  }
  return m;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (a && b && typeof a === "object") {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
    return true;
  }
  return false;
}

// Look for added↔deleted pairs whose names match case-insensitively (e.g.
// "testVFX" → "TestVFX") and reclassify them as 'M' renames. Mutates the map
// in place. Returns the names that were removed from the map (i.e. the old
// "deleted" names that got rolled into renames).
function pairCaseRenames(map, type, isInner) {
  const addedByLower = new Map();
  const deletedByLower = new Map();
  for (const [name, entry] of map) {
    const lower = typeof name === "string" ? name.toLowerCase() : name;
    if (entry.status === "A") addedByLower.set(lower, name);
    else if (entry.status === "D") deletedByLower.set(lower, name);
  }
  const removed = [];
  for (const [lower, addedName] of addedByLower) {
    const deletedName = deletedByLower.get(lower);
    if (!deletedName || deletedName === addedName) continue;

    const addedEntry = map.get(addedName);
    const deletedEntry = map.get(deletedName);
    if (isInner) {
      map.set(addedName, {
        status: "M",
        oldValue: deletedEntry.oldValue,
        newValue: addedEntry.newValue,
        renamedFrom: deletedName,
      });
    } else {
      const oldBody = deletedEntry.oldEntry[deletedName];
      const newBody = addedEntry.newEntry[addedName];
      const innerDiffs = computeInnerDiff(oldBody, newBody, type);
      map.set(addedName, {
        status: "M",
        oldEntry: deletedEntry.oldEntry,
        newEntry: addedEntry.newEntry,
        innerDiffs,
        renamedFrom: deletedName,
      });
    }
    map.delete(deletedName);
    removed.push(deletedName);
  }
  return removed;
}

// Build the inner diff map for a single entry's body. Returns Map<itemName, {status, oldValue, newValue}>.
function computeInnerDiff(oldVal, newVal, type) {
  let oldMap, newMap;
  if (type === "C" || type === "S") {
    oldMap = membersArrayToMap(oldVal);
    newMap = membersArrayToMap(newVal);
  } else if (type === "F") {
    oldMap = functionsArrayToMap(oldVal);
    newMap = functionsArrayToMap(newVal);
  } else if (type === "E") {
    oldMap = enumValuesToMap(oldVal);
    newMap = enumValuesToMap(newVal);
  } else {
    return new Map();
  }

  const result = new Map();
  for (const [k, nv] of newMap) {
    if (!oldMap.has(k)) {
      result.set(k, { status: "A", oldValue: null, newValue: nv });
    } else {
      const ov = oldMap.get(k);
      const same = type === "E" ? ov === nv : deepEqual(ov, nv);
      result.set(k, {
        status: same ? "U" : "M",
        oldValue: ov,
        newValue: nv,
      });
    }
  }
  for (const [k, ov] of oldMap) {
    if (!newMap.has(k)) {
      result.set(k, { status: "D", oldValue: ov, newValue: null });
    }
  }

  // Detect case-only renames between A and D entries.
  pairCaseRenames(result, type, true);

  return result;
}

function buildDiffSummary(oldData, newData, type) {
  const summary = new Map();
  const deletedNames = [];

  const oldByName = entriesToMap(oldData);
  const newByName = entriesToMap(newData);

  for (const [name, newEntry] of newByName) {
    if (!oldByName.has(name)) {
      summary.set(name, {
        status: "A",
        oldEntry: null,
        newEntry,
        innerDiffs: computeInnerDiff(null, newEntry[name], type),
      });
    } else {
      const oldEntry = oldByName.get(name);
      const innerDiffs = computeInnerDiff(oldEntry[name], newEntry[name], type);
      const hasChange = [...innerDiffs.values()].some((d) => d.status !== "U");
      summary.set(name, {
        status: hasChange ? "M" : "U",
        oldEntry,
        newEntry,
        innerDiffs,
      });
    }
  }
  for (const [name, oldEntry] of oldByName) {
    if (!newByName.has(name)) {
      summary.set(name, {
        status: "D",
        oldEntry,
        newEntry: null,
        innerDiffs: computeInnerDiff(oldEntry[name], null, type),
      });
      deletedNames.push(name);
    }
  }

  // Detect class-level case-only renames (e.g. testVFX → TestVFX). The
  // renamed-from entry is folded into the new name with a 'M' status.
  const renamedAway = new Set(pairCaseRenames(summary, type, false));
  const filteredDeleted = deletedNames.filter((n) => !renamedAway.has(n));

  return { summary, deletedNames: filteredDeleted };
}

async function startDiff(commitSha, dateLabel) {
  const file = typeFileForCurrent();
  if (!file) {
    showToast("Diff is only available for classes, structs, functions, enums.");
    return;
  }
  const url =
    "https://raw.githubusercontent.com/Spuckwaffel/dumpspace/" +
    commitSha +
    "/Games/" +
    rawDirectory +
    file;
  showToast("Loading diff…", false);
  try {
    const text = await decompressJSONByURL(url);
    const oldJson = JSON.parse(text);
    let summary, deletedNames;
    if (currentType === "O") {
      ({ summary, deletedNames } = buildOffsetsDiffSummary(
        oldJson.data,
        currentInfoJson.data,
      ));
    } else {
      ({ summary, deletedNames } = buildDiffSummary(
        oldJson.data,
        currentInfoJson.data,
        currentType,
      ));
    }
    diffActiveSha = commitSha;
    diffActiveDate = dateLabel;
    diffSummary = summary;
    deletedEntryNames = deletedNames;

    setUrlDiffParam(commitSha);
    showDiffBanner();
    if (currentType === "O") {
      // Offsets view doesn't have a class list — re-render the offsets layout.
      showOffsets(currentInfoJson.credit, currentInfoJson.data);
    } else {
      rebuildClassListAfterDiff();
    }
    showToast("Diff loaded.", false);
  } catch (e) {
    console.error("[diff] failed", e);
    showToast("Failed to load diff: " + e.message);
  }
  // Close history modal so user sees the diffed view.
  document.getElementById("uploadHistoryDiv").classList.add("hidden");
}

function exitDiff() {
  diffActiveSha = null;
  diffActiveDate = null;
  diffSummary = null;
  deletedEntryNames = [];
  setUrlDiffParam(null);
  hideDiffBanner();
  if (currentType === "O") {
    showOffsets(currentInfoJson.credit, currentInfoJson.data);
  } else {
    rebuildClassListAfterDiff();
  }
}

function showDiffBanner() {
  const banner = document.getElementById("diff-banner");
  const dateSpan = document.getElementById("diff-banner-date");
  if (banner) banner.classList.remove("hidden");
  if (dateSpan) dateSpan.textContent = diffActiveDate || "(unknown date)";
}

function hideDiffBanner() {
  const banner = document.getElementById("diff-banner");
  if (banner) banner.classList.add("hidden");
}

// Rebuild the VRV class-list data in place (so badges + deleted entries
// appear / disappear) and re-render the currently focused entry. We do NOT
// recreate the VanillaRecyclerView here — recreating inside the same
// container leaks the old VRV's DOM and breaks scroll-area sizing
// (manifests as a half-empty scroller).
function rebuildClassListAfterDiff() {
  formattedArrayData.length = 0;
  emptyClassNames = new Set();

  for (const gameClass of currentInfoJson.data) {
    const name = Object.keys(gameClass)[0];
    formattedArrayData.push(name);

    const items = gameClass[name];
    let isEmpty = false;
    if (currentType === "E") {
      isEmpty =
        !Array.isArray(items) ||
        !Array.isArray(items[0]) ||
        items[0].length === 0;
    } else if (currentType === "C" || currentType === "S") {
      isEmpty =
        !Array.isArray(items) ||
        items.filter(
          (m) => !RESERVED_MEMBER_NAMES.has(Object.keys(m)[0]),
        ).length === 0;
    } else {
      isEmpty = !Array.isArray(items) || items.length === 0;
    }
    if (isEmpty) emptyClassNames.add(name);
  }

  if (diffSummary && deletedEntryNames.length > 0) {
    for (const delName of deletedEntryNames) {
      formattedArrayData.push(delName);
    }
  }

  // VirtualList.setData invalidates every pool slot so visible rows repaint
  // immediately — no recreate / no double-call dance needed.
  if (dVanillaRecyclerView) {
    dVanillaRecyclerView.setData(formattedArrayData);
    classDiv.scrollTop = 0;
  }

  if (focussedCName) {
    displayCurrentType(focussedCName);
  }
}

function getDiffStatusClasses(status) {
  if (status === "A") {
    return {
      badge:
        "bg-green-200 text-green-800 dark:bg-green-900 dark:text-green-200",
      row: "bg-green-50/50 dark:bg-green-950/20",
      marker: "text-green-600 dark:text-green-400",
      markerChar: "+",
    };
  }
  if (status === "M") {
    return {
      badge:
        "bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
      row: "",
      marker: "text-amber-600 dark:text-amber-400",
      markerChar: "",
    };
  }
  if (status === "D") {
    return {
      badge: "bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200",
      row: "bg-red-50/50 dark:bg-red-950/20",
      marker: "text-red-600 dark:text-red-400",
      markerChar: "−",
    };
  }
  return { badge: "", row: "", marker: "", markerChar: "" };
}
