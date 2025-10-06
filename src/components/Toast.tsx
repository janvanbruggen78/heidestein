import React, { useState, useRef } from 'react';
import { Animated, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export function useToast() {
  const navigation = useNavigation();
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const fade = useRef(new Animated.Value(0)).current;

  const show = (msg: string) => {
    setMessage(msg);
    console.log(msg);
    setVisible(true);
    Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }).start(() => {
      setTimeout(() => {
        Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
          setVisible(false);
        });
      }, 4000);
    });
  };

  const Toast = visible ? (
    <Animated.View
      style={{
        position: 'absolute',
        bottom: 150,
        left: 0,
        right: 0,
        alignItems: 'center',
        opacity: fade,
        zIndex: 3,
        elevation: 3,
      }}
    >
      <TouchableOpacity
        activeOpacity={1}
        style={{
          backgroundColor: 'rgba(0,0,0,0.8)',
          paddingVertical: 8,
          paddingHorizontal: 16,
          borderRadius: 20,
        }}
      >
        <Text style={{ color: 'white', textAlign: 'center' }}>
          {message === 'Track saved to archive.' ? (
            <>
              Track saved to{' '}
              <Text
                style={{ textDecorationLine: 'underline' }}
                onPress={() => {
                  setVisible(false);
                  navigation.navigate('Archive');
                }}
              >
                Archive
              </Text>
              .
            </>
          ) : (
            message
          )}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  ) : null;

  return { show, Toast };
}
