import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { parseMd, toMd, todayKey, pickDefault, parseListDate, emptyCounts, addDays, formatListName, recurringItems, eventLabel, missingLabels } from './utils';
import Header from './components/Header';
import CalendarPanel from './components/CalendarPanel';
import ProgressBar from './components/ProgressBar';
import ItemList from './components/ItemList';
import CountsPanel from './components/CountsPanel';
import GraphPage from './components/GraphPage';
import RecurringPanel from './components/RecurringPanel';
import AddRow from './components/AddRow';
import Toast from './components/Toast';

export default function App() {
  const [lists, setLists] = useState([]);
  const [activeList, setActiveList] = useState(null);
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState(emptyCounts());
  const [countsOpen, setCountsOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);
  const [moveMode, setMoveMode] = useState(false);
  const [recurring, setRecurring] = useState([]);
  // Extra calendars (data/calendars.json) that failed on the latest fetch: [{id, reason}].
  const [gcalFailures, setGcalFailures] = useState([]);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [allMeta, setAllMeta] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error | no-api | no-lists
  const [newItemValue, setNewItemValue] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  const toastTimer = useRef(null);
  const mainRef = useRef(null);
  const justAdded = useRef(false);
  // Latest list/items for moveItem, which runs queued after earlier moves.
  const activeListRef = useRef(activeList);
  activeListRef.current = activeList;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const listsRef = useRef(lists);
  listsRef.current = lists;
  const moveQueue = useRef(Promise.resolve());
  // Recurring saves, in order; Refresh waits on it so it never reads
  // recurring.json while an edit is still in flight. `recurringEdits` counts
  // edits so a refetch never overwrites a newer local change.
  const recurringSave = useRef(Promise.resolve());
  const recurringEdits = useRef(0);

  const dateLabel = useMemo(() => {
    const date = activeList && parseListDate(activeList);
    if (!date) return '';
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }, [activeList]);

  function toast(msg) {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 3500);
  }

  async function switchList(name) {
    setActiveList(name);
    setStatus('loading');
    try {
      const [md, meta] = await Promise.all([api.get(name), api.getMeta(name)]);
      setItems(parseMd(md));
      setCounts({ ...emptyCounts(), ...meta });
      setStatus('ready');
    } catch (e) {
      setStatus('error');
      toast('Load error: ' + e.message);
    }
  }

  async function loadLists() {
    setStatus('loading');
    try {
      const names = await api.lists();
      setLists(names);
      if (names.length > 0) {
        await switchList(pickDefault(names));
      } else {
        setActiveList(null);
        setStatus('no-lists');
      }
    } catch (e) {
      setStatus('no-api');
      toast('Connection error: ' + e.message);
    }
  }

  function refreshGcalFailures() {
    api.gcalStatus().then((s) => setGcalFailures(s.failures || [])).catch(() => {});
  }

  useEffect(() => {
    api.getRecurring().then(setRecurring).catch(() => {});
    refreshGcalFailures();
    loadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!graphOpen) return;
    let cancelled = false;
    api
      .getAllMeta()
      .then((m) => { if (!cancelled) setAllMeta(m); })
      .catch(() => {
        if (cancelled) return;
        setAllMeta({});
        toast('Could not load counts history');
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphOpen]);

  useEffect(() => {
    if (justAdded.current) {
      justAdded.current = false;
      mainRef.current?.lastElementChild?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [items]);

  // `items` plus `labels` appended as unchecked items.
  function appendLabels(items, labels) {
    let id = items.reduce((m, i) => Math.max(m, i.id), 0);
    return [...items, ...labels.map((label) => ({ id: ++id, label, checked: false, moved: false }))];
  }

  async function persist(nextItems) {
    if (!activeList) return;
    try {
      await api.put(activeList, toMd(nextItems));
    } catch (e) {
      toast('Save error: ' + e.message);
    }
  }

  async function toggleItem(id) {
    if (items.find((i) => i.id === id)?.moved) return; // only changed via move mode
    const next = items.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i));
    setItems(next);
    await persist(next);
  }

  async function removeItem(id) {
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    await persist(next);
  }

  async function addItem() {
    const label = newItemValue.trim();
    if (!label || !activeList) return;
    const maxId = items.reduce((m, i) => Math.max(m, i.id), 0);
    const next = [...items, { id: maxId + 1, label, checked: false }];
    justAdded.current = true;
    setItems(next);
    setNewItemValue('');
    await persist(next);
  }

  // Move mode: send an unchecked item to the day after the viewed list, or
  // undo a previous move. Queued so rapid taps don't race each other's writes.
  function moveItem(id) {
    moveQueue.current = moveQueue.current.then(() => moveOrRestore(id));
  }

  async function moveOrRestore(id) {
    const name = activeListRef.current;
    const cur = itemsRef.current;
    const item = cur.find((i) => i.id === id);
    const date = name && parseListDate(name);
    if (!item || item.checked) return;
    if (!date) return toast('Moving needs a dated list');
    const nextName = formatListName(addDays(date, 1));
    const exists = listsRef.current.includes(nextName);

    // 1. Next day's list: append a copy, or remove the last unchecked copy.
    // `wrote` holds its prior markdown so step 2 can roll it back.
    let wrote = null;
    try {
      if (!item.moved) {
        const md = exists ? await api.get(nextName) : await seedFor(nextName);
        const nextItems = parseMd(md);
        const maxId = nextItems.reduce((m, i) => Math.max(m, i.id), 0);
        nextItems.push({ id: maxId + 1, label: item.label, checked: false, moved: false });
        await api.put(nextName, toMd(nextItems));
        wrote = md;
        if (!exists) {
          listsRef.current = [...listsRef.current, nextName];
          setLists((prev) => (prev.includes(nextName) ? prev : [...prev, nextName]));
        }
      } else if (exists) {
        const md = await api.get(nextName);
        const nextItems = parseMd(md);
        const idx = nextItems.findLastIndex((i) => !i.checked && !i.moved && i.label === item.label);
        if (idx !== -1) {
          nextItems.splice(idx, 1);
          await api.put(nextName, toMd(nextItems));
          wrote = md;
        }
      }
    } catch (e) {
      return toast(`Move error (${nextName}): ${e.message}`);
    }

    // 2. This list: flip the moved marker. On failure, roll back step 1.
    const next = cur.map((i) => (i.id === id ? { ...i, moved: !i.moved } : i));
    try {
      await api.put(name, toMd(next));
    } catch (e) {
      try {
        if (wrote !== null) await api.put(nextName, wrote);
      } catch {
        return toast(`Save error — ${nextName} may now be out of sync: ${e.message}`);
      }
      return toast('Save error, move undone: ' + e.message);
    }
    itemsRef.current = next;
    if (activeListRef.current === name) setItems(next);
  }

  async function adjustCount(cat, delta) {
    const next = { ...counts, [cat]: Math.max(0, (counts[cat] || 0) + delta) };
    setCounts(next);
    if (!activeList) return;
    try {
      await api.putMeta(activeList, next);
    } catch (e) {
      toast('Counts save error: ' + e.message);
    }
  }

  // Calendar event labels for the day `date`. Throws if not connected.
  async function fetchCalendarLabels(date) {
    try {
      const evs = await api.gcalEvents(date.toISOString(), addDays(date, 1).toISOString());
      return evs.map(eventLabel);
    } finally {
      refreshGcalFailures();
    }
  }

  // Markdown for a new list: recurring items for that weekday, plus calendar
  // events if Google Calendar is connected (silently skipped otherwise).
  async function seedFor(name) {
    const date = parseListDate(name);
    if (!date) return '';
    const labels = recurringItems(recurring, date);
    try {
      for (const l of await fetchCalendarLabels(date)) if (!labels.includes(l)) labels.push(l);
    } catch { /* not connected / offline */ }
    return toMd(labels.map((label, i) => ({ id: i + 1, label, checked: false })));
  }

  async function importCalendar() {
    const date = activeList && parseListDate(activeList);
    if (!date) return;
    try {
      const status = await api.gcalStatus();
      if (!status.configured) return toast('Add data/google-credentials.json first (see server.js)');
      if (!status.connected) {
        window.open(`/gcal/start?token=password`, '_blank');
        return toast('Authorize in the new tab, then import again');
      }
      const fresh = missingLabels(items, [], await fetchCalendarLabels(date), date);
      if (!fresh.length) return toast('Nothing new on your calendar');
      const next = appendLabels(items, fresh);
      setItems(next);
      await persist(next);
      toast(`Imported ${fresh.length} event${fresh.length === 1 ? '' : 's'}`);
    } catch (e) {
      toast('Calendar error: ' + e.message);
    }
  }

  function stepDay(n) {
    const date = activeList && parseListDate(activeList);
    if (date) selectOrCreateList(formatListName(addDays(date, n)));
  }

  function changeRecurring(next) {
    setRecurring(next);
    recurringEdits.current++;
    recurringSave.current = recurringSave.current
      .then(() => api.putRecurring(next))
      .catch((e) => toast('Recurring save error: ' + e.message));
  }

  // Switch to `name`, creating an empty list for it first if it doesn't exist yet.
  async function selectOrCreateList(name) {
    setCalendarOpen(false);
    if (lists.includes(name)) {
      await switchList(name);
      return;
    }
    try {
      await api.put(name, await seedFor(name));
      setLists((prev) => [...prev, name]);
      await switchList(name);
    } catch (e) {
      toast('Create error: ' + e.message);
    }
  }

  async function handleNewCustomList() {
    const name = window.prompt('New list name:', todayKey());
    if (!name?.trim()) return;
    await selectOrCreateList(name.trim());
  }

  async function handleDeleteList() {
    if (!activeList) return;
    if (!window.confirm(`Delete "${activeList}"?\n\nThis cannot be undone.`)) return;
    const name = activeList;
    try {
      await api.delete(name);
      const remaining = lists.filter((l) => l !== name);
      setLists(remaining);
      setCountsOpen(false);
      if (remaining.length > 0) {
        await switchList(remaining[0]);
      } else {
        setActiveList(null);
        setItems([]);
        setCounts(emptyCounts());
        setStatus('no-lists');
      }
    } catch (e) {
      toast('Delete error: ' + e.message);
    }
  }

  // Reload the viewed list, then append any of its weekday's recurring items
  // and that day's calendar events not already on it (matched by label, any
  // state), saving once. Queued behind moveQueue so it never races a pending
  // move's writes. Silent on success; every failure toasts.
  async function handleRefresh() {
    if (!activeList) return loadLists();
    const name = activeList;
    const run = moveQueue.current.then(() => refreshList(name));
    moveQueue.current = run;
    await run;
  }

  // Calendar labels for Refresh: [] if Google isn't configured; throws if it
  // is but the fetch fails.
  async function refreshCalendarLabels(date) {
    if (!date || !(await api.gcalStatus()).configured) return [];
    return fetchCalendarLabels(date);
  }

  async function refreshList(name) {
    setStatus('loading');
    const date = parseListDate(name);
    const errors = [];
    try {
      const edits = recurringEdits.current;
      const [md, meta, rec, events] = await Promise.all([
        api.get(name),
        api.getMeta(name),
        recurringSave.current.then(() => api.getRecurring()).catch((e) => {
          errors.push('Recurring items error: ' + e.message);
          return null;
        }),
        refreshCalendarLabels(date).catch((e) => {
          errors.push('Calendar events could not be loaded: ' + e.message);
          return [];
        }),
      ]);
      if (rec && recurringEdits.current === edits) setRecurring(rec);
      let next = parseMd(md);
      const fresh = missingLabels(next, rec || [], events, date);
      if (fresh.length) {
        const withFresh = appendLabels(next, fresh);
        try {
          await api.put(name, toMd(withFresh));
          next = withFresh;
        } catch (e) {
          errors.push('Save error: ' + e.message);
        }
      }
      if (errors.length) toast(errors.join(' · '));
      if (activeListRef.current !== name) return;
      itemsRef.current = next;
      setItems(next);
      setCounts({ ...emptyCounts(), ...meta });
      setStatus('ready');
    } catch (e) {
      if (activeListRef.current !== name) return;
      setStatus('error');
      toast('Load error: ' + e.message);
    }
  }

  const listStatus = status === 'ready' && !activeList ? 'no-lists' : status;

  if (graphOpen) {
    return <GraphPage lists={lists} metaByName={allMeta} onBack={() => setGraphOpen(false)} />;
  }

  return (
    <>
      <Header
        activeList={activeList}
        dateLabel={dateLabel}
        hasActiveList={!!activeList}
        countsOpen={countsOpen}
        calendarOpen={calendarOpen}
        recurringOpen={recurringOpen}
        onPrevDay={() => stepDay(-1)}
        onNextDay={() => stepDay(1)}
        onGoToday={() => selectOrCreateList(todayKey())}
        onImportCalendar={importCalendar}
        onToggleRecurring={() => setRecurringOpen((v) => !v)}
        onRefresh={handleRefresh}
        onToggleCounts={() => setCountsOpen((v) => !v)}
        onToggleCalendar={() => setCalendarOpen((v) => !v)}
        onOpenGraph={() => setGraphOpen(true)}
        moveMode={moveMode}
        onToggleMoveMode={() => setMoveMode((v) => !v)}
        onDeleteList={handleDeleteList}
        gcalFailures={gcalFailures}
      />

      {calendarOpen && (
        <CalendarPanel
          lists={lists}
          activeList={activeList}
          onSelectDate={selectOrCreateList}
          onCreateCustom={handleNewCustomList}
        />
      )}

      {status === 'ready' && activeList && <ProgressBar done={items.filter((i) => i.checked).length} total={items.filter((i) => !i.moved).length} />}

      <main ref={mainRef}>
        <ItemList
          status={listStatus}
          items={items}
          moveMode={moveMode}
          onToggle={toggleItem}
          onMove={moveItem}
          onDelete={removeItem}
        />
      </main>

      <CountsPanel
        open={countsOpen && !!activeList}
        counts={counts}
        onAdjust={adjustCount}
        onClose={() => setCountsOpen(false)}
      />

      <RecurringPanel
        open={recurringOpen}
        items={recurring}
        onChange={changeRecurring}
        onClose={() => setRecurringOpen(false)}
      />

      {moveMode ? (
        <div className="add-row">
          <button className="end-move-btn" onClick={() => setMoveMode(false)}>
            End move mode
          </button>
        </div>
      ) : (
        <AddRow value={newItemValue} onChange={setNewItemValue} onSubmit={addItem} disabled={!activeList} />
      )}

      <Toast message={toastMsg} />
    </>
  );
}
