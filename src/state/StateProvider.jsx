import { useReducer } from 'react';
import { StateContext, reducer, initialState } from './store.js';

export function StateProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <StateContext.Provider value={{ state, dispatch }}>
      {children}
    </StateContext.Provider>
  );
}
