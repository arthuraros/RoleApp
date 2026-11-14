import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, ScrollView, TextInput, View } from 'react-native';
import { focusedFieldScrollDelta, keyboardOverlap } from '../utils/keyboardGeometry';

// Mede em coordenadas da janela, incluindo cabeçalhos, safe areas e modais.
// Não guarda altura inicial nem subtrai novamente o resize já feito pelo Android.
export function KeyboardViewport({ children, style, onLayout }) {
  const view = useRef(null);
  const keyboard = useRef(Keyboard.metrics?.());
  const measurement = useRef(0);
  const [overlap, setOverlap] = useState(0);
  const measure = useCallback(() => {
    const version = ++measurement.current;
    if (!keyboard.current) { setOverlap(0); return; }
    view.current?.measureInWindow((x, y, width, height) => {
      if (version === measurement.current) setOverlap(keyboardOverlap({ x, y, width, height }, keyboard.current));
    });
  }, []);

  useEffect(() => {
    const change = event => {
      keyboard.current = event.endCoordinates;
      if (Platform.OS === 'ios') Keyboard.scheduleLayoutAnimation?.(event);
      measure();
    };
    const hide = () => { keyboard.current = null; measurement.current += 1; setOverlap(0); };
    const events = Platform.OS === 'ios'
      ? [['keyboardWillChangeFrame', change], ['keyboardDidShow', change], ['keyboardWillHide', hide]]
      : [['keyboardDidShow', change], ['keyboardDidHide', hide]];
    const subscriptions = events.map(([name, handler]) => Keyboard.addListener(name, handler));
    measure();
    return () => { measurement.current += 1; subscriptions.forEach(subscription => subscription.remove()); };
  }, [measure]);

  return <View ref={view} collapsable={false} style={[style, { paddingBottom: overlap }]} onLayout={event => {
    measure(); onLayout?.(event);
  }}>{children}</View>;
}

export function KeyboardAwareScrollView({
  ref: forwardedRef, children, onFocus, onBlur, onLayout, onScroll, onContentSizeChange,
  keyboardShouldPersistTaps = 'handled', keyboardDismissMode = 'none', ...props
}) {
  const scroll = useRef(null);
  const focusedInput = useRef(null);
  const keyboard = useRef(Keyboard.metrics?.());
  const offset = useRef(0);
  const frame = useRef(null);
  const measurement = useRef(0);
  const setRef = useCallback(value => {
    scroll.current = value;
    if (typeof forwardedRef === 'function') forwardedRef(value);
    else if (forwardedRef) forwardedRef.current = value;
  }, [forwardedRef]);

  const ensureVisible = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    const version = ++measurement.current;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const input = focusedInput.current;
      if (!input || input !== TextInput.State.currentlyFocusedInput()) return;
      const nativeScroll = scroll.current?.getNativeScrollRef?.() || scroll.current;
      nativeScroll?.measureInWindow((x, y, width, height) => {
        input.measureInWindow((inputX, inputY, inputWidth, inputHeight) => {
          if (version !== measurement.current || input !== TextInput.State.currentlyFocusedInput()) return;
          const delta = focusedFieldScrollDelta({ x, y, width, height },
            { x: inputX, y: inputY, width: inputWidth, height: inputHeight }, keyboard.current);
          if (delta) scroll.current?.scrollTo({ y: Math.max(0, offset.current + delta), animated: false });
        });
      });
    });
  }, []);

  useEffect(() => {
    const change = event => { keyboard.current = event.endCoordinates; ensureVisible(); };
    const hide = () => { keyboard.current = null; measurement.current += 1; };
    const subscriptions = [
      Keyboard.addListener('keyboardDidShow', change),
      Keyboard.addListener('keyboardDidChangeFrame', change),
      Keyboard.addListener('keyboardDidHide', hide),
    ];
    return () => {
      measurement.current += 1;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      subscriptions.forEach(subscription => subscription.remove());
    };
  }, [ensureVisible]);

  return <ScrollView {...props} ref={setRef}
    automaticallyAdjustKeyboardInsets={false}
    keyboardShouldPersistTaps={keyboardShouldPersistTaps} keyboardDismissMode={keyboardDismissMode}
    scrollEventThrottle={16}
    onFocus={event => {
      focusedInput.current = TextInput.State.currentlyFocusedInput();
      onFocus?.(event); ensureVisible();
    }}
    onBlur={event => { focusedInput.current = null; measurement.current += 1; onBlur?.(event); }}
    onLayout={event => { onLayout?.(event); ensureVisible(); }}
    onContentSizeChange={(width, height) => { onContentSizeChange?.(width, height); ensureVisible(); }}
    onScroll={event => { offset.current = event.nativeEvent.contentOffset.y; onScroll?.(event); }}
  >{children}</ScrollView>;
}
