import {useMemo, useSyncExternalStore} from 'react';
const listeners=new Set();
let query=window.audit.callback?'callbackUrl='+encodeURIComponent(window.audit.callback):window.audit.initialQuery||'';
const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};
const snapshot=()=>query;
function navigate(url) {
 window.routes.push(url);
 if(!window.audit.reactiveNavigation)return;
 const next=new URL(url,'http://audit.invalid').search.slice(1);
 if(query===next)return;
 query=next;for(const listener of listeners)listener();
}
const router={push:navigate,replace:navigate,refresh:()=>{window.refreshes=(window.refreshes||0)+1}};
export const redirect=navigate;
export const useRouter=()=>router;
export const usePathname=()=>'/dashboard/history';
export const useParams=()=>({id:window.audit.operationId||'synthetic-operation'});
export function useSearchParams(){const value=useSyncExternalStore(subscribe,snapshot,snapshot);return useMemo(()=>new URLSearchParams(value),[value]);}
