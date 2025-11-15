import React, { useMemo, useState, useRef, useEffect } from 'react';
import { LocalParticipant, RemoteParticipant } from 'livekit-client';
import { VideoTile } from '../components/VideoGrid';

interface GalleryLayoutProps {
  allParticipants: (LocalParticipant | RemoteParticipant)[];
  currentUserUid?: string;
  onPin?: (participantId: string | null) => void;
  pinnedId: string | null;
}

const MAX_TILES_PER_PAGE = 9;

// ✅ Zoom-style layout rules per participant count
const getGridLayout = (count: number): { rows: number; cols: number } => {
  if (count === 0) return { rows: 1, cols: 1 };
  if (count === 1) return { rows: 1, cols: 1 };
  if (count === 2) return { rows: 1, cols: 2 };
  if (count === 3) return { rows: 2, cols: 2 }; // 2 on top, 1 centered bottom
  if (count === 4) return { rows: 2, cols: 2 };
  if (count === 5 || count === 6) return { rows: 2, cols: 3 };
  if (count === 7 || count === 8 || count === 9) return { rows: 3, cols: 3 };
  // For > 9, use 3x3 grid (will be paginated)
  return { rows: 3, cols: 3 };
};

const GalleryLayout: React.FC<GalleryLayoutProps> = ({
  allParticipants,
  currentUserUid,
  onPin,
  pinnedId,
}) => {
  // State for drag-and-drop
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [participantOrder, setParticipantOrder] = useState<string[]>([]);
  
  // ✅ Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  
  const gridRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  // Disable drag when only 1 participant
  const isDragEnabled = allParticipants.length > 1;
  
  // Initialize participant order
  useEffect(() => {
    const ids = allParticipants.map(p => p.identity || p.sid);
    setParticipantOrder(prev => {
      const existing = prev.filter(id => ids.includes(id));
      const newIds = ids.filter(id => !prev.includes(id));
      return [...existing, ...newIds];
    });
  }, [allParticipants]);
  
  // Get ordered participants based on user's arrangement
  const orderedParticipants = useMemo(() => {
    const orderMap = new Map(participantOrder.map((id, index) => [id, index]));
    return [...allParticipants].sort((a, b) => {
      const idA = a.identity || a.sid;
      const idB = b.identity || b.sid;
      const indexA = orderMap.get(idA) ?? 9999;
      const indexB = orderMap.get(idB) ?? 9999;
      return indexA - indexB;
    });
  }, [allParticipants, participantOrder]);
  
  // ✅ Pagination: Split participants into pages
  const pages = useMemo(() => {
    const pageArray: (LocalParticipant | RemoteParticipant)[][] = [];
    for (let i = 0; i < orderedParticipants.length; i += MAX_TILES_PER_PAGE) {
      pageArray.push(orderedParticipants.slice(i, i + MAX_TILES_PER_PAGE));
    }
    return pageArray;
  }, [orderedParticipants]);
  
  // ✅ Reset to first page if current page doesn't exist
  useEffect(() => {
    if (currentPage >= pages.length && pages.length > 0) {
      setCurrentPage(0);
    }
  }, [currentPage, pages.length]);
  
  // ✅ Get current page participants
  const currentPageParticipants = pages[currentPage] || [];
  
  // ✅ Get grid layout for current page
  const { rows, cols } = getGridLayout(currentPageParticipants.length);
  
  // ✅ Pagination handlers
  const canGoPrevious = currentPage > 0;
  const canGoNext = currentPage < pages.length - 1;
  
  const handlePreviousPage = () => {
    if (canGoPrevious) {
      setCurrentPage(currentPage - 1);
    }
  };
  
  const handleNextPage = () => {
    if (canGoNext) {
      setCurrentPage(currentPage + 1);
    }
  };
  
  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent, participantId: string) => {
    if (!isDragEnabled || currentPageParticipants.length <= 1) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    setDraggingId(participantId);
    
    const gridRect = gridRef.current?.getBoundingClientRect();
    if (gridRect) {
      const x = e.clientX - gridRect.left;
      const y = e.clientY - gridRect.top;
      setMousePosition({ x, y });
    } else {
      setMousePosition({ x: 0, y: 0 });
    }
  };
  
  const handleMouseUp = () => {
    // ✅ Reorder within current page only
    if (draggingId && hoverIndex !== null) {
      const pageStartIndex = currentPage * MAX_TILES_PER_PAGE;
      const pageEndIndex = pageStartIndex + currentPageParticipants.length;
      const globalCurrentIndex = participantOrder.indexOf(draggingId);
      
      // Only reorder if both indices are on the current page
      if (globalCurrentIndex >= pageStartIndex && globalCurrentIndex < pageEndIndex) {
        const localHoverIndex = hoverIndex;
        const localCurrentIndex = globalCurrentIndex - pageStartIndex;
        
        if (localCurrentIndex !== localHoverIndex && localHoverIndex >= 0 && localHoverIndex < currentPageParticipants.length) {
          const newOrder = [...participantOrder];
          const pageOrder = newOrder.slice(pageStartIndex, pageEndIndex);
          pageOrder.splice(localCurrentIndex, 1);
          pageOrder.splice(localHoverIndex, 0, draggingId);
          newOrder.splice(pageStartIndex, pageOrder.length, ...pageOrder);
          setParticipantOrder(newOrder);
        }
      }
    }
    
    setDraggingId(null);
    setMousePosition(null);
    setHoverIndex(null);
  };
  
  // Global mouse handlers for smooth dragging
  useEffect(() => {
    if (draggingId && isDragEnabled && gridRef.current && wrapperRef.current && currentPageParticipants.length > 1) {
      let currentHoverIndex: number | null = null;
      
      const handleGlobalMouseMove = (e: MouseEvent) => {
        const gridRect = gridRef.current?.getBoundingClientRect();
        if (!gridRect) return;
        
        let x = e.clientX - gridRect.left;
        let y = e.clientY - gridRect.top;
        
        // Constrain to grid bounds
        const tileWidth = gridRect.width / cols;
        const tileHeight = gridRect.height / rows;
        x = Math.max(tileWidth / 2, Math.min(x, gridRect.width - tileWidth / 2));
        y = Math.max(tileHeight / 2, Math.min(y, gridRect.height - tileHeight / 2));
        
        setMousePosition({ x, y });
        
        // Calculate which grid position we're hovering over
        const col = Math.floor((x / gridRect.width) * cols);
        const row = Math.floor((y / gridRect.height) * rows);
        const targetIndex = Math.min(row * cols + col, currentPageParticipants.length - 1);
        currentHoverIndex = targetIndex;
        setHoverIndex(targetIndex);
      };
      
      const handleGlobalMouseUp = () => {
        if (draggingId && currentHoverIndex !== null) {
          const pageStartIndex = currentPage * MAX_TILES_PER_PAGE;
          const globalCurrentIndex = participantOrder.indexOf(draggingId);
          
          if (globalCurrentIndex >= pageStartIndex && globalCurrentIndex < pageStartIndex + currentPageParticipants.length) {
            const localCurrentIndex = globalCurrentIndex - pageStartIndex;
            const localHoverIndex = currentHoverIndex;
            
            if (localCurrentIndex !== localHoverIndex && localHoverIndex >= 0 && localHoverIndex < currentPageParticipants.length) {
              const newOrder = [...participantOrder];
              const pageOrder = newOrder.slice(pageStartIndex, pageStartIndex + currentPageParticipants.length);
              pageOrder.splice(localCurrentIndex, 1);
              pageOrder.splice(localHoverIndex, 0, draggingId);
              newOrder.splice(pageStartIndex, pageOrder.length, ...pageOrder);
              setParticipantOrder(newOrder);
            }
          }
        }
        
        setDraggingId(null);
        setMousePosition(null);
        setHoverIndex(null);
      };
      
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      
      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [draggingId, isDragEnabled, cols, rows, currentPageParticipants.length, currentPage, participantOrder]);
  
  if (allParticipants.length === 0) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="text-center text-gray-400">
          <p>Waiting for participants to join...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div 
      ref={wrapperRef}
      className="video-grid-wrapper" 
      style={{ 
        height: '100%',
        width: '100%',
        overflow: 'hidden', /* NO SCROLL */
        padding: 0,
        margin: 0,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        border: 'none' /* EXACTLY like Speaker view - no borders */
      }}
      onMouseUp={handleMouseUp}
    >
      {/* ✅ Main grid area - NO SCROLL, centered */}
      <div
        ref={gridRef}
        className="video-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridAutoRows: '1fr',
          gap: 0, /* NO GAPS - edge-to-edge like Zoom */
          rowGap: 0, /* NO ROW GAPS */
          columnGap: 0, /* NO COLUMN GAPS */
          padding: 0,
          margin: 'auto', /* Center the grid */
          width: '100%',
          height: '100%',
          maxWidth: '100%',
          maxHeight: '100%',
          justifyItems: 'stretch',
          alignItems: 'stretch',
          justifyContent: 'center',
          alignContent: 'center',
          position: 'relative',
          overflow: 'hidden', /* NO SCROLL */
          background: 'transparent', /* Transparent - blue gradient shows through */
          border: 'none' /* EXACTLY like Speaker view - no borders */
        }}
      >
        {currentPageParticipants.map((participant) => {
          const participantId = participant.identity || participant.sid;
          const stableKey = participantId;
          const isDragging = draggingId === participantId;
          
          return (
            <div
              key={stableKey}
              className="relative overflow-hidden"
              onMouseDown={(e) => handleMouseDown(e, participantId)}
              style={{
                borderRadius: 0,
                border: 'none', /* EXACTLY like Speaker view - minimal wrapper */
                width: '100%',
                aspectRatio: '16 / 9',
                height: 'auto',
                cursor: isDragEnabled && currentPageParticipants.length > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
              }}
            >
              <VideoTile
                participant={participant}
                currentUserUid={currentUserUid}
                onPin={onPin}
                pinnedId={pinnedId}
              />
            </div>
          );
        })}
      </div>
      
      {/* ✅ Pagination arrows - only show if more than 9 participants */}
      {pages.length > 1 && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          zIndex: 100
        }}>
          <button
            onClick={handlePreviousPage}
            disabled={!canGoPrevious}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: 'none',
              background: canGoPrevious ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              cursor: canGoPrevious ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              opacity: canGoPrevious ? 1 : 0.5
            }}
          >
            ◀
          </button>
          <span style={{ color: 'white', fontSize: '14px', minWidth: '60px', textAlign: 'center' }}>
            {currentPage + 1} / {pages.length}
          </span>
          <button
            onClick={handleNextPage}
            disabled={!canGoNext}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: 'none',
              background: canGoNext ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              cursor: canGoNext ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              opacity: canGoNext ? 1 : 0.5
            }}
          >
            ▶
          </button>
        </div>
      )}
      
      {/* ✅ Drag preview placeholder */}
      {draggingId && mousePosition && gridRef.current && wrapperRef.current && (() => {
        const gridRect = gridRef.current.getBoundingClientRect();
        const wrapperRect = wrapperRef.current.getBoundingClientRect();
        
        const tileWidth = gridRect.width / cols;
        const tileHeight = gridRect.height / rows;
        
        const mouseXRelativeToWrapper = mousePosition.x + (gridRect.left - wrapperRect.left);
        const mouseYRelativeToWrapper = mousePosition.y + (gridRect.top - wrapperRect.top);
        
        const constrainedX = Math.max(tileWidth / 2, Math.min(mouseXRelativeToWrapper, wrapperRect.width - tileWidth / 2));
        const constrainedY = Math.max(tileHeight / 2, Math.min(mouseYRelativeToWrapper, wrapperRect.height - tileHeight / 2));
        
        return (
          <div
            key={`drag-preview-placeholder-${draggingId}`}
            style={{
              position: 'absolute',
              left: `${constrainedX - tileWidth / 2}px`,
              top: `${constrainedY - tileHeight / 2}px`,
              width: `${tileWidth}px`,
              height: `${tileHeight}px`,
              borderRadius: 0,
              border: 'none', /* NO visible border on drag preview */
              background: 'transparent', /* Transparent - no visible border */
              boxShadow: 'none', /* NO visible border/shadow */
              cursor: 'grabbing',
              zIndex: 1000,
              pointerEvents: 'none',
              transform: 'scale(1.05)',
              opacity: 0.8,
              visibility: 'visible',
              aspectRatio: '16 / 9',
              transition: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <div style={{
              color: 'rgba(59, 130, 246, 1)',
              fontSize: '14px',
              fontWeight: 'bold',
              textAlign: 'center',
              pointerEvents: 'none'
            }}>
              Dragging...
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default GalleryLayout;
