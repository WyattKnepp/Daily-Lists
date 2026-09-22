import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { parseMd, toMd, todayKey, pickDefault, parseListDate, emptyCounts } from './utils';
import Header from './components/Header';
import CalendarPanel from './components/CalendarPanel';
import ProgressBar from './components/ProgressBar';
import ItemList from './components/ItemList';
import CountsPanel from './components/CountsPanel';
import TrendsPanel from './components/TrendsPanel';
import AddRow from './components/AddRow';
import Toast from './components/Toast';

export default function App() {
  const [lists, setLists] = useState([]);
  const [activeList, setActiveList] = useState(null);
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState(emptyCounts());
  const [countsOpen, setCountsOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [trendsOpen, setTrendsOpen] = useState(false);
  const [allMeta, setAllMeta] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error | no-api | no-lists
  const [newItemValue, setNewItemValue] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  const toastTimer = useRef(null);
  const mainRef = useRef(null);
  const justAdded = useRef(false);

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

  useEffect(() => {
    loadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!trendsOpen) return;
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
  }, [trendsOpen]);

  useEffect(() => {
    if (justAdded.current) {
      justAdded.current = false;
      mainRef.current?.lastElementChild?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [items]);

  async function persist(nextItems) {
    if (!activeList) return;
    try {
      await api.put(activeList, toMd(nextItems));
    } catch (e) {
      toast('Save error: ' + e.message);
    }
  }

  async function toggleItem(id) {
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

  // Switch to `name`, creating an empty list for it first if it doesn't exist yet.
  async function selectOrCreateList(name) {
    setCalendarOpen(false);
    if (lists.includes(name)) {
      await switchList(name);
      return;
    }
    try {
      await api.put(name, '');
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

  async function handleRefresh() {
    if (activeList) {
      await switchList(activeList);
    } else {
      await loadLists();
    }
  }

  const listStatus = status === 'ready' && !activeList ? 'no-lists' : status;

  return (
    <>
      <Header
        activeList={activeList}
        dateLabel={dateLabel}
        hasActiveList={!!activeList}
        countsOpen={countsOpen}
        calendarOpen={calendarOpen}
        trendsOpen={trendsOpen}
        onRefresh={handleRefresh}
        onToggleCounts={() => setCountsOpen((v) => !v)}
        onToggleCalendar={() => setCalendarOpen((v) => !v)}
        onToggleTrends={() => setTrendsOpen((v) => !v)}
        onDeleteList={handleDeleteList}
      />

      {calendarOpen && (
        <CalendarPanel
          lists={lists}
          activeList={activeList}
          onSelectDate={selectOrCreateList}
          onCreateCustom={handleNewCustomList}
        />
      )}

      {status === 'ready' && activeList && <ProgressBar done={items.filter((i) => i.checked).length} total={items.length} />}

      <main ref={mainRef}>
        <ItemList status={listStatus} items={items} onToggle={toggleItem} onDelete={removeItem} />
      </main>

      <CountsPanel
        open={countsOpen && !!activeList}
        counts={counts}
        onAdjust={adjustCount}
        onClose={() => setCountsOpen(false)}
      />

      <TrendsPanel
        open={trendsOpen}
        lists={lists}
        metaByName={allMeta}
        onClose={() => setTrendsOpen(false)}
      />

      <AddRow value={newItemValue} onChange={setNewItemValue} onSubmit={addItem} disabled={!activeList} />

      <Toast message={toastMsg} />
    </>
  );
}
