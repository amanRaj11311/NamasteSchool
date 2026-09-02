import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

export function navigate(name: string, params?: any) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name as never, params as never);
  }
}

export function replace(name: string, params?: any) {
  if (navigationRef.isReady()) {
    // Note: React Navigation v6/v7 mein global replace ke liye dispatch use karna padta hai
    navigationRef.reset({
      index: 0,
      routes: [{ name }],
    });
  }
}