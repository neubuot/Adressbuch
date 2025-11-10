import { supabase } from './supabase'
import type { Database } from './database.types'

type Contact = Database['public']['Tables']['contacts']['Row']
type ContactInsert = Database['public']['Tables']['contacts']['Insert']
type ContactUpdate = Database['public']['Tables']['contacts']['Update']

/**
 * Fetch all contacts for the current user
 */
export async function getContacts(): Promise<Contact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })

  if (error) {
    console.error('Error fetching contacts:', error)
    throw error
  }

  return data || []
}

/**
 * Get a single contact by ID
 */
export async function getContact(id: string): Promise<Contact | null> {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching contact:', error)
    throw error
  }

  return data
}

/**
 * Create a new contact
 */
export async function createContact(contact: ContactInsert): Promise<Contact> {
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .from('contacts')
    .insert({
      ...contact,
      user_id: user.id,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating contact:', error)
    throw error
  }

  return data
}

/**
 * Update an existing contact
 */
export async function updateContact(
  id: string,
  updates: ContactUpdate
): Promise<Contact> {
  const { data, error } = await supabase
    .from('contacts')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating contact:', error)
    throw error
  }

  return data
}

/**
 * Delete a contact
 */
export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting contact:', error)
    throw error
  }
}

/**
 * Search contacts
 */
export async function searchContacts(query: string): Promise<Contact[]> {
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('User not authenticated')
  }

  const { data, error } = await supabase
    .rpc('search_contacts', {
      search_query: query,
      user_uuid: user.id,
    })

  if (error) {
    console.error('Error searching contacts:', error)
    throw error
  }

  return data || []
}
