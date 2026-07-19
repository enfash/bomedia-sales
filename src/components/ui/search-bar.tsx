import React from 'react';
import { Searchbar as PaperSearchbar, SearchbarProps } from 'react-native-paper';
import { StyleSheet, View } from 'react-native';

export type SearchBarProps = SearchbarProps;

/**
 * @description Customized SearchBar using React Native Paper's Searchbar with standard elevation and height.
 * @props SearchBarProps (inherits Paper SearchbarProps)
 * @example
 * <SearchBar placeholder="Search records..." onChangeText={setQuery} value={query} />
 * @variants bar (default)
 * @accessibility 
 * - Includes standard search input accessibility roles.
 * - Minimum height of 48dp for easy tapping.
 */
export function SearchBar(props: SearchBarProps) {
  return (
    <View style={styles.container}>
      <PaperSearchbar
        mode="bar"
        elevation={1}
        style={[styles.searchbar, props.style]}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  searchbar: {
    borderRadius: 8,
    height: 48,
  },
});
